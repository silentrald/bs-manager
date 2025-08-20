import path from "path";
import log from "electron-log";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { existsSync, readFile, writeFile } from "fs-extra";

import { InstallationLocationService } from "../installation-location.service";
import { BSVersion } from "shared/bs-version.interface";
import { BSLocalVersionService } from "../bs-local-version.service";
import { APP_NAME } from "main/constants";

export class SongCoreModService {
    private static instance: SongCoreModService;

    public getInstance(): SongCoreModService {
        if (!SongCoreModService.instance) {
            SongCoreModService.instance = new SongCoreModService();
        }
        return SongCoreModService.instance;
    }

    private readonly SONG_CORE_MOD = "SongCore.dll";
    private readonly FOLDERS_XML_PATH = path.join("UserData", "SongCore", "folders.xml");

    private readonly installLocationService: InstallationLocationService;
    private readonly localVersionService: BSLocalVersionService;

    private constructor() {
        this.installLocationService = InstallationLocationService.getInstance();
        this.localVersionService = BSLocalVersionService.getInstance();
    }

    /**
     * Check if SongCore mod is installed
     */
    private async checkModInstalled(version: BSVersion): Promise<boolean> {
        const versionPath = await this.localVersionService
            .getVersionPath(version);
        const modPath = path.join(versionPath, "Plugins", this.SONG_CORE_MOD);
        if (existsSync(modPath)) {
            return true;
        }

        const modPendingPath = path.join(versionPath, "IPA", "Pending", "Plugins", this.SONG_CORE_MOD);
        return existsSync(modPendingPath);
    }

    public async updateEntryInFoldersXml(version: BSVersion) {
        try {
            if (!this.checkModInstalled(version)) {
                log.info("SongCore is not installed in", version.BSVersion);
                return;
            }

            const versionPath = await this.localVersionService
                .getVersionPath(version);
            const folderXmlPath = path.join(versionPath, this.FOLDERS_XML_PATH);
            if (!existsSync(folderXmlPath)) {
                log.info("folders.xml does not exists in", version.BSVersion);
                return;
            }

            const xmlString = await readFile(folderXmlPath, "utf-8");

            const xmlParser = new XMLParser();
            const folders = xmlParser.parse(xmlString);

            if (!folders.folder) {
                folders.folder = [];
            }

            // Create the new folder entry
            const sharedMapFolder = this.installLocationService
              .sharedContentPath("SharedMaps");
            const folder = {
                Name: APP_NAME,
                Path: sharedMapFolder,
                Pack: 0,
                CreatedBy: APP_NAME,
            };

            const index = folders.folder.find((folder: any) => folder.CreatedBy === APP_NAME);
            if (index === -1) {
                folders.folder.push(folder);
            } else {
                folders.folder[index] = folder;
            }

            const xmlBuilder = new XMLBuilder();
            const newXmlString = xmlBuilder.build(folders);

            await writeFile(folderXmlPath, newXmlString);

            log.info("folders.xml updated for", version.BSVersion);
        } catch (error) {
            log.error(error);
        }
    }

    public async removeEntryInFoldersXml(version: BSVersion) {
        try {
            if (!this.checkModInstalled(version)) {
                log.info("SongCore is not installed in", version.BSVersion);
                return;
            }

            const versionPath = await this.localVersionService
                .getVersionPath(version);
            const folderXmlPath = path.join(versionPath, this.FOLDERS_XML_PATH);
            if (!existsSync(folderXmlPath)) {
                log.info("folders.xml does not exists in", version.BSVersion);
                return;
            }

            const xmlString = await readFile(folderXmlPath, "utf-8");

            const xmlParser = new XMLParser();
            const folders = xmlParser.parse(xmlString);

            if (!folders.folder || folders.folder.length === 0) {
                return;
            }

            const index = folders.folder.find((folder: any) => folder.CreatedBy === APP_NAME);
            if (index === -1) {
                return;
            }

            folders.folder.splice(index, 1);

            const xmlBuilder = new XMLBuilder();
            const newXmlString = xmlBuilder.build(folders);

            await writeFile(folderXmlPath, newXmlString);

            log.info("folders.xml updated for", version.BSVersion);
        } catch (error) {
            log.error(error);
        }
    }

}
