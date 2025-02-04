
const path = require("path");
const cp = require("child_process");

function updateCommand(command, options) {
    if (options?.args) {
        command += ` ${options.args.join(" ")}`;
    }

    if (process.platform === "win32") {
        options.options.shell = true;
    } else if (process.platform === "linux") {
        // "/bin/sh" does not see flatpak-spawn
        // All distros should support "bash" by default
        options.options.shell = "bash";

        if (options.linux?.prefix) {
            command = `${options.linux.prefix} ${command}`;
        }

        if (options?.flatpak?.host) {
            const envArgs = (options?.flatpak?.env && options?.options?.env)
                && options.flatpak.env
                    .filter(envName => options.options.env[envName])
                    .map(envName =>
                         `--env=${envName}="${options.options.env[envName]}"`
                    )
                    .join(" ");
            command = `flatpak-spawn --host ${envArgs || ""} ${command}`;
        }
    }

    return command;
}

function bsmSpawn(command, options) {
    options = options || {};
    options.options = options.options || {};
    command = updateCommand(command, options);

    console.log("INFO", command, options);

    return cp.spawn(command, options.options);
}

const folder = "C:\\Users\\rland\\BSManager\\BSInstances\\1.39.1";
const game = path.join(folder, "Beat Saber.exe");

const cmd = bsmSpawn(`"${game}"`, {
    args: [ "--no-yeet" ],
    options: { cwd: folder, }
});

cmd.on("close", (code) => {
    console.debug("Error code: ", code);
});

