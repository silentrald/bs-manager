import { LaunchOption } from "shared/models/bs-launch";
import { BSLocalVersionService } from "../bs-local-version.service";
import { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "child_process";
import path from "path";
import log from "electron-log";
import { sToMs } from "../../../shared/helpers/time.helpers";
import { LinuxService } from "../linux.service";
import { BsmShellLog, bsmSpawn } from "main/helpers/os.helpers";
import { IS_FLATPAK } from "main/constants";
import { LaunchMods } from "shared/models/bs-launch/launch-option.interface";

export abstract class AbstractLauncherService {

    protected readonly linux = LinuxService.getInstance();
    protected readonly localVersions = BSLocalVersionService.getInstance();

    constructor(){
        this.linux = LinuxService.getInstance();
        this.localVersions = BSLocalVersionService.getInstance();
    }

    protected buildBsLaunchArgs(launchOptions: LaunchOption): string[]{
        const launchArgs = [];

        if(!launchOptions.version.steam && !launchOptions.version.oculus){
            launchArgs.push("--no-yeet")
        }
        if(launchOptions.launchMods?.includes(LaunchMods.OCULUS)) {
            launchArgs.push("-vrmode");
            launchArgs.push("oculus");
        }
        if(launchOptions.launchMods?.includes(LaunchMods.FPFC)) {
            launchArgs.push("fpfc");
        }
        if(launchOptions.launchMods?.includes(LaunchMods.DEBUG)) {
            launchArgs.push("--verbose");
        }
        if(launchOptions.launchMods?.includes(LaunchMods.EDITOR)) {
            launchArgs.push("editor");
        }

        if (launchOptions.additionalArgs) {
            launchArgs.push(...launchOptions.additionalArgs);
        }

        return Array.from(new Set(launchArgs).values());
    }

    protected launchBSProcess(bsExePath: string, args: string[], options?: SpawnOptionsWithoutStdio): ChildProcessWithoutNullStreams {

        const spawnOptions: SpawnOptionsWithoutStdio = { detached: true, cwd: path.dirname(bsExePath), ...(options || {}) };

        if(args.includes("--verbose")){
            spawnOptions.windowsVerbatimArguments = true;
        }

        spawnOptions.shell = true; // For windows to spawn properly
        return bsmSpawn(`"${bsExePath}"`, {
            args, options: spawnOptions, log: BsmShellLog.Command,
            linux: { prefix: this.linux.getProtonPrefix() },
            flatpak: {
                host: IS_FLATPAK,
                env: [
                    "SteamAppId",
                    "SteamOverlayGameId",
                    "SteamGameId",
                    "WINEDLLOVERRIDES",
                    "STEAM_COMPAT_DATA_PATH",
                    "STEAM_COMPAT_INSTALL_PATH",
                    "STEAM_COMPAT_CLIENT_INSTALL_PATH",
                    "STEAM_COMPAT_APP_ID",
                    "SteamEnv",
                ],
            },
        });
    }

    protected launchBs(bsExePath: string, args: string[], options?: SpawnBsProcessOptions): {process: ChildProcessWithoutNullStreams, exit: Promise<number>} {
        const process = this.launchBSProcess(bsExePath, args, options);

        let timoutId: NodeJS.Timeout;

        const exit = new Promise<number>((resolve, reject) => {
            // Don't remove, useful for debugging!
            // process.stdout.on("data", (data) => {
            //     log.info(`BS stdout: ${data}`);
            // });
            // process.stderr.on("data", (data) => {
            //     log.error(`BS stderr: ${data}`);
            // });

            process.on("error", (err) => {
                log.error(`Error while launching BS`, err);
                reject(err);
            });

            process.on("exit", (code) => {
                log.info(`BS process exit with code ${code}`);
                resolve(code);
            });

            const unrefAfter = options?.unrefAfter ?? sToMs(10);

            timoutId = setTimeout(() => {
                log.error("BS process unref after timeout", unrefAfter);
                process.unref();
                process.removeAllListeners();
                resolve(-1);
            }, unrefAfter);

        }).finally(() => {
            clearTimeout(timoutId);
        });

        return { process, exit };
    }
}

export type SpawnBsProcessOptions = {
    unrefAfter?: number;
} & SpawnOptionsWithoutStdio;
