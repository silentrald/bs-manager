import { createFolderLinkerServiceV2 } from "./folder-linker-v2.service";
import { InstallationLocationService } from "./installation-location.service";

const installLocationService = InstallationLocationService.getInstance();

export const folderLinkerServiceV2 = createFolderLinkerServiceV2({
    installLocationService: {
        installationDirectory: () => installLocationService.installationDirectory(),
        sharedContentPath: () => installLocationService.sharedContentPath(),
    },
});
