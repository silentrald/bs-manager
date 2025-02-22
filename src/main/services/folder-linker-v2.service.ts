import log from "electron-log";
import path from "path";
import { randomUUID } from "crypto";
import { tryit } from "shared/helpers/error.helpers";
import { deleteFileSync, deleteFolder, deleteFolderSync, ensureFolderExist, moveFolderContent, pathExist } from "main/helpers/fs.helpers";
import { LinkOptions, FolderLinkerServiceV2Params, FolderLinkerServiceV2 } from "./types";
import { CustomError } from "shared/models/exceptions/custom-error.class";
import { copy, lstat, mkdirSync, readlink, symlink, symlinkSync } from "fs-extra";
import { lastValueFrom } from "rxjs";

export function createFolderLinkerServiceV2({
    installLocationService
}: FolderLinkerServiceV2Params): FolderLinkerServiceV2 {
    const linkingType: "junction" | "symlink" = process.platform === "win32" ? "junction" : "symlink";

    // === PRIVATE === //

    const getLinkingType = (): "junction" | undefined => {
        return linkingType === "junction" ? "junction" : undefined;
    };

    // === Shared Folder Logic === //

    const sharedFolder = (): string => {
        return installLocationService.sharedContentPath();
    };

    const getSharedFolder = (folderPath: string, intermediateFolder?: string): string => {
        return path.join(sharedFolder(), intermediateFolder ?? "", path.basename(folderPath));
    };

    // === Backup Logic === //

    const getBackupFolder = (folderPath: string): string => {
        return `${folderPath}_backup`;
    }

    const backupFolder = async (folderPath: string): Promise<void> => {
        if (!(await pathExist(folderPath))) {
            return;
        }

        return copy(
            folderPath,
            getBackupFolder(folderPath),
            { overwrite: true, errorOnExist: false }
        );
    }

    return {
        sharedFolder,

        isLinkingSupported() {
            const uuid = randomUUID();
            const installationPath = installLocationService.installationDirectory();
            const testFolder = path.join(installationPath, uuid);
            const testLink = path.join(installationPath, `${uuid}_link`);

            const resLink = tryit(() => {
                mkdirSync(testFolder);
                symlinkSync(testFolder, testLink, getLinkingType());
            });

            tryit(() => {
                deleteFolderSync(testFolder);
                deleteFileSync(testLink);
            });

            if (resLink.error) {
                log.error("Unable to create symlink", resLink.error);
            }

            return !resLink.error;
        },

        async isFolderSymlink(folder) {
            try {
                if (!(await pathExist(folder))) {
                    return false;
                }
                return await lstat(folder).then(stat => stat.isSymbolicLink());
            } catch (e) {
                log.error(e);
            }
            return false;
        },

        async linkFolder(folderPath: string, options?: LinkOptions): Promise<void> {
            if (!this.isLinkingSupported()) {
                throw new CustomError("Linking is not supported on this platform", "LinkingNotSupported");
            }

            const sharedPath = getSharedFolder(folderPath, options?.intermediateFolder);

            if (await this.isFolderSymlink(folderPath)) {
                const isTargetedToSharedPath = await readlink(folderPath)
                    .then(target => target === sharedPath)
                    .catch(() => false);
                if (isTargetedToSharedPath) {
                    return;
                }
                await deleteFolder(folderPath);

                log.info(`Linking ${folderPath} to ${sharedPath}; type: ${linkingType}`);
                return symlink(sharedPath, folderPath, getLinkingType());
            }

            await ensureFolderExist(sharedPath);

            if (options?.backup === true) {
                await backupFolder(folderPath);
            }

            await ensureFolderExist(folderPath);

            if (options?.keepContents !== false) {
                await lastValueFrom(moveFolderContent(folderPath, sharedPath, { overwrite: true }));
            }

            await deleteFolder(folderPath);

            log.info(`Linking ${folderPath} to ${sharedPath}; type: ${linkingType}`);
            return symlink(sharedPath, folderPath, getLinkingType());
        },
    };
}
