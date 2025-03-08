import { parseEnvString } from "main/helpers/env.helpers";

describe("Test parseEnvString", () => {

    it("Empty", () => {
        const { envVars, command } = parseEnvString("");
        expect(envVars).toEqual({});
        expect(command).toEqual("");
    });

    it("Single test; no quotes", () => {
        const envString = "HELLO=World!";
        const { envVars, command } = parseEnvString(envString);
        expect(envVars).toEqual({
            HELLO: "World!",
        });
        expect(command).toEqual("");
    });

    it("Single test; single quotes", () => {
        const envString = "SINGLE_QOUTE='Single quote with spaces'";
        const { envVars, command } = parseEnvString(envString);
        expect(envVars).toEqual({
            SINGLE_QOUTE: "Single quote with spaces",
        });
        expect(command).toEqual("");
    });

    it("Single test; double quotes", () => {
        const envString = 'DOUBLE_QOUTE="Some random quote."';
        const { envVars, command } = parseEnvString(envString);
        expect(envVars).toEqual({
            DOUBLE_QOUTE: "Some random quote.",
        });
        expect(command).toEqual("");
    });

    it("Single test; empty value", () => {
        const envString = "EMPTY=";
        const { envVars, command } = parseEnvString(envString);
        expect(envVars).toEqual({
            EMPTY: "",
        });
        expect(command).toEqual("");
    });

    it("Multiple test; combined", () => {
        const envString = `HELLO=World! DOUBLE_QUOTE="Two Words" SINGLE_QUOTE='' EMPTY=`
        const { envVars, command } = parseEnvString(envString);
        expect(envVars).toEqual(expect.objectContaining({
            HELLO: "World!",
            DOUBLE_QUOTE: "Two Words",
            SINGLE_QUOTE: "",
            EMPTY: ""
        }));
        expect(command).toEqual("");
    });

    it("Key with numbers and lower case", () => {
        const envString = "H3ll0=world";
        const { envVars, command } = parseEnvString(envString);
        expect(envVars).toEqual({
            H3ll0: "world",
        });
        expect(command).toEqual("");
    });

    it("Env vars with command", () => {
        const prefix = `HELLO=World! DOUBLE_QUOTE="Two Words" SINGLE_QUOTE='' EMPTY= some-prefix command-here`;
        const { envVars, command } = parseEnvString(prefix);
        expect(envVars).toEqual(expect.objectContaining({
            HELLO: "World!",
            DOUBLE_QUOTE: "Two Words",
            SINGLE_QUOTE: "",
            EMPTY: ""
        }));
        expect(command).toEqual("some-prefix command-here");
    })

});
