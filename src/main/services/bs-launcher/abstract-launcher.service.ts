import { LaunchOption } from "shared/models/bs-launch";
import { BSLocalVersionService } from "../bs-local-version.service";
import { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "child_process";
import path from "path";
import log from "electron-log";
import { sToMs } from "../../../shared/helpers/time.helpers";
import { LinuxService } from "../linux.service";
import { BsmShellLog, bsmSpawn } from "main/helpers/os.helpers";
import { COMMAND_FORMAT, IS_FLATPAK } from "main/constants";
import { LaunchMods } from "shared/models/bs-launch/launch-option.interface";
import { parseEnvString } from "main/helpers/env.helpers";

export function buildBsLaunchArgs(launchOptions: LaunchOption): string[] {
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

    if (launchOptions.command) {
        launchArgs.push(launchOptions.command);
    }

    return Array.from(new Set(launchArgs).values());
}

export abstract class AbstractLauncherService {

    protected readonly linux = LinuxService.getInstance();
    protected readonly localVersions = BSLocalVersionService.getInstance();

    constructor(){
        this.linux = LinuxService.getInstance();
        this.localVersions = BSLocalVersionService.getInstance();
    }

    protected launchBSProcess(params: BSLaunchParameters): ChildProcessWithoutNullStreams {

        const spawnOptions: SpawnOptionsWithoutStdio = {
            detached: true,
            cwd: path.dirname(params.bsExePath),
            ...(params.options || {})
        };

        if(params.args.includes("--verbose")){
            spawnOptions.windowsVerbatimArguments = true;
        }

        spawnOptions.shell = true; // For windows to spawn properly
        return bsmSpawn(`"${params.bsExePath}"`, {
            args: params.args,
            options: spawnOptions,
            log: BsmShellLog.Command,
            prefix: params.prefix || "",
            flatpak: { host: IS_FLATPAK },
        });
    }

    protected launchBs(params: BSLaunchParameters): {process: ChildProcessWithoutNullStreams, exit: Promise<number>} {
        const process = this.launchBSProcess(params);

        let timeoutId: NodeJS.Timeout;

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

            const unrefAfter = params.options?.unrefAfter ?? sToMs(10);

            timeoutId = setTimeout(() => {
                log.error("BS process unref after timeout", unrefAfter);
                process.unref();
                process.removeAllListeners();
                resolve(-1);
            }, unrefAfter);

        }).finally(() => {
            clearTimeout(timeoutId);
        });

        return { process, exit };
    }

    protected injectAdditionalArgsEnvs(
        launchOptions: LaunchOption,
        env: Record<string, string>
    ) {
        if (!launchOptions.command) {
            return;
        }

        const { command } = launchOptions;
        const index = command.indexOf(COMMAND_FORMAT);
        if (index === -1) {
            return;
        }

        const envString = command.substring(0, index);
        log.info("Parsing env string ", `"${envString}"`);

        const { envVars, command: newCommand } = parseEnvString(envString);

        for (const [ key, value ] of Object.entries(envVars)) {
            if (key in env) {
                log.warn("Ignoring", `${key}=${value}`, "already set env launch command");
                continue;
            }

            log.info("Injecting", `${key}="${value}"`, "to the env launch command");
            env[key] = value;
        }

        launchOptions.command = `${newCommand} ${command.substring(index)}`;
    }

}

export type SpawnBsProcessOptions = {
    unrefAfter?: number;
} & SpawnOptionsWithoutStdio;

export type BSLaunchParameters = {
    bsExePath: string;
    args: string[];
    prefix?: string;
    options?: SpawnBsProcessOptions;
};
