import log from "electron-log";
import { deleteFolder, ensureFolderExist, moveFolderContent, pathExist } from "../helpers/fs.helpers";
import path from "path";
import { copy } from "fs-extra";
import { lastValueFrom } from "rxjs";
import { noop } from "shared/helpers/function.helpers";
import { StaticConfigurationService } from "./static-configuration.service";
import { FolderLinkerServiceV2, LinkOptions } from "./types";
import { folderLinkerServiceV2 } from ".";

export class FolderLinkerService {
    private static instance: FolderLinkerService;

    public static getInstance(): FolderLinkerService {
        if (!FolderLinkerService.instance) {
            FolderLinkerService.instance = new FolderLinkerService();
        }
        return FolderLinkerService.instance;
    }

    private readonly selfV2: FolderLinkerServiceV2;
    private readonly staticConfig: StaticConfigurationService;

    // Only Windows support "junction", this is disregarded in other os'es
    private linkingType: "junction" | "symlink" =
        process.platform === "win32" ? "junction" : "symlink";

    private constructor() {
        this.selfV2 = folderLinkerServiceV2;
        this.staticConfig = StaticConfigurationService.getInstance();

        if (process.platform === "win32") {
            // Only Windows support "junction", this is disregarded in other os'es
            this.linkingType = this.staticConfig.get("use-symlinks") === true ? "symlink" : "junction";
            log.info(`Linking type is set to ${this.linkingType}`);

            this.staticConfig.$watch("use-symlinks").subscribe((useSymlink) => {
                this.linkingType = useSymlink === true ? "symlink" : "junction";
                log.info(`Linking type set to ${this.linkingType}`);
            });
        }
    }

    public isLinkingSupported(): boolean {
        return this.selfV2.isLinkingSupported();
    }

    /**
     * @deprecated use InstallationLocationService.sharedContentPath()
     */
    public sharedFolder(): string {
        return this.selfV2.sharedFolder();
    }

    private async getSharedFolder(folderPath: string, intermediateFolder?: string): Promise<string> {
        return path.join(this.sharedFolder(), intermediateFolder ?? "", path.basename(folderPath));
    }

    private getBackupFolder(folderPath: string): string {
        return `${folderPath}_backup`;
    }

    private async restoreFolder(folderPath: string): Promise<void> {
        if (!(await pathExist(this.getBackupFolder(folderPath)))) {
            return;
        }
        return copy(this.getBackupFolder(folderPath), folderPath, { overwrite: true, errorOnExist: false }).then(() => {
            return deleteFolder(this.getBackupFolder(folderPath));
        });
    }

    public async linkFolder(folderPath: string, options?: LinkOptions): Promise<void> {
        return this.selfV2.linkFolder(folderPath, options);
    }

    public async unlinkFolder(folderPath: string, options?: UnlinkOptions): Promise<void> {
        if (!(await this.isFolderSymlink(folderPath))) {
            return;
        }
        await deleteFolder(folderPath);

        const sharedPath = await this.getSharedFolder(folderPath, options?.intermediateFolder);

        await ensureFolderExist(folderPath);

        if (options?.backup === true) {
            return this.restoreFolder(folderPath);
        }

        if (options.moveContents === true) {
            return lastValueFrom(moveFolderContent(sharedPath, folderPath, { overwrite: true })).then(noop);
        }

        if (options?.keepContents === false) {
            return;
        }

        await ensureFolderExist(sharedPath);

        return copy(sharedPath, folderPath, { errorOnExist: false, recursive: true });
    }

    public async isFolderSymlink(folder: string): Promise<boolean> {
        return this.selfV2.isFolderSymlink(folder);
    }
}

export interface UnlinkOptions extends LinkOptions {
    moveContents?: boolean;
}
