import { BSVersion } from "shared/bs-version.interface";

// NOTE: Partial interfaces for now

export interface LinkOptions {
    keepContents?: boolean;
    intermediateFolder?: string;
    backup?: boolean;
}

export interface BSLocalVersionServiceV2 {
    getVersionPath(version: BSVersion): Promise<string>;
}

export interface FolderLinkerServiceV2Params {
    installLocationService: InstallationLocationServiceV2;
}

export interface FolderLinkerServiceV2 {
    /**
     * @deprecated use InstallationLocationServiceV2.sharedContentPath()
     */
    sharedFolder(): string;
    isLinkingSupported(): boolean;
    isFolderSymlink(folder: string): Promise<boolean>;
    linkFolder(folderPath: string, options?: LinkOptions): Promise<void>;
}

export interface InstallationLocationServiceV2 {
    installationDirectory(): string;
    sharedContentPath(): string;
}
