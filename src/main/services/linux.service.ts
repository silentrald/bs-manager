import fs from "fs-extra";
import log from "electron-log";
import path from "path";
import { BS_APP_ID, IS_FLATPAK, PROTON_BINARY_PREFIX, WINE_BINARY_PREFIX } from "main/constants";
import { InstallationLocationService } from "./installation-location.service";
import { StaticConfigurationService } from "./static-configuration.service";
import { CustomError } from "shared/models/exceptions/custom-error.class";
import { BSLaunchError, LaunchOption } from "shared/models/bs-launch";
import { BsmShellLog, bsmExec } from "main/helpers/os.helpers";
import { LaunchMods } from "shared/models/bs-launch/launch-option.interface";

export class LinuxService {
    private static instance: LinuxService;

    public static getInstance(): LinuxService {
        if (!LinuxService.instance) {
            LinuxService.instance = new LinuxService();
        }
        return LinuxService.instance;
    }

    private readonly installLocationService: InstallationLocationService;
    private readonly staticConfig: StaticConfigurationService;
    private protonPrefix = "";

    private nixOS: boolean | undefined;

    private constructor() {
        this.installLocationService = InstallationLocationService.getInstance();
        this.staticConfig = StaticConfigurationService.getInstance();
    }

    // === Launching === //

    private getCompatDataPath() {
        const sharedFolder = this.installLocationService.sharedContentPath();
        return path.resolve(sharedFolder, "compatdata");
    }

    public async setupLaunch(
        launchOptions: LaunchOption,
        steamPath: string,
        bsFolderPath: string,
        env: Record<string, string>
    ) {
        if (launchOptions.admin) {
            log.warn("Launching as admin is not supported on Linux! Starting the game as a normal user.");
            launchOptions.admin = false;
        }

        // Create the compat data path if it doesn't exist.
        // If the user never ran Beat Saber through steam before
        // using bsmanager, it won't exist, and proton will fail
        // to launch the game.
        const compatDataPath = this.getCompatDataPath();
        if (!fs.existsSync(compatDataPath)) {
            log.info(`Proton compat data path not found at '${compatDataPath}', creating directory`);
            fs.mkdirSync(compatDataPath);
        }

        if (!this.staticConfig.has("proton-folder")) {
            throw CustomError.fromError(
                new Error("Proton folder not set"),
                BSLaunchError.PROTON_NOT_SET
            );
        }
        const protonPath = path.join(
            this.staticConfig.get("proton-folder"),
            PROTON_BINARY_PREFIX
        );
        if (!fs.pathExistsSync(protonPath)) {
            throw CustomError.fromError(
                new Error("Could not locate proton binary"),
                BSLaunchError.PROTON_NOT_FOUND
            );
        }

        this.protonPrefix = await this.isNixOS()
            ? `steam-run "${protonPath}" run`
            : `"${protonPath}" run`;

        // Setup Proton environment variables
        Object.assign(env, {
            "WINEDLLOVERRIDES": "winhttp=n,b", // Required for mods to work
            "STEAM_COMPAT_DATA_PATH": compatDataPath,
            "STEAM_COMPAT_INSTALL_PATH": bsFolderPath,
            "STEAM_COMPAT_CLIENT_INSTALL_PATH": steamPath,
            "STEAM_COMPAT_APP_ID": BS_APP_ID,
            // Run game in steam environment; fixes #585 for unicode song titles
            "SteamEnv": 1,
        });

        if (launchOptions.launchMods?.includes(LaunchMods.PROTON_LOGS)) {
            Object.assign(env, {
                "PROTON_LOG": 1,
                "PROTON_LOG_DIR": path.join(bsFolderPath, "Logs"),
            });
        }
    }

    public verifyProtonPath(protonFolder: string = ""): boolean {
        if (protonFolder === "") {
            if (!this.staticConfig.has("proton-folder")) {
                return false;
            }

            protonFolder = this.staticConfig.get("proton-folder");
        }

        const protonPath = path.join(protonFolder, PROTON_BINARY_PREFIX);
        const winePath = path.join(protonFolder, WINE_BINARY_PREFIX);
        return fs.pathExistsSync(protonPath) && fs.pathExistsSync(winePath);
    }

    public getWinePath(): string {
        if (!this.staticConfig.has("proton-folder")) {
            throw new Error("proton-folder variable not set");
        }

        const winePath = path.join(
            this.staticConfig.get("proton-folder"),
            WINE_BINARY_PREFIX
        );
        if (!fs.pathExistsSync(winePath)) {
            throw new Error(`"${winePath}" binary file not found`);
        }

        return winePath;
    }

    public getWinePrefixPath(): string {
        const compatDataPath = this.getCompatDataPath();
        return fs.existsSync(compatDataPath)
            ? path.join(compatDataPath, "pfx") : "";
    }

    public getProtonPrefix(): string {
        // Set in setupLaunch
        return this.protonPrefix;
    }

    // === NixOS Specific === //

    public async isNixOS(): Promise<boolean> {
        if (this.nixOS !== undefined) {
            return this.nixOS;
        }

        try {
            await bsmExec("nixos-version", {
                log: BsmShellLog.Command,
                flatpak: { host: IS_FLATPAK },
            });
            this.nixOS = true;
        } catch (error) {
            log.info("Not NixOS", error);
            this.nixOS = false;
        }

        return this.nixOS;
    }
}
