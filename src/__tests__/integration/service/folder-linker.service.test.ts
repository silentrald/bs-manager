import path from "path";
import { ASSETS_FOLDER } from "__tests__/consts";
import { mkdir, readdir, rm, writeFile } from "fs-extra";
import { randomUUID } from "crypto";
import { createFolderLinkerServiceV2 } from "main/services/folder-linker-v2.service";

const OUTPUT_FOLDER = path.join(ASSETS_FOLDER, "out");
const VERSION_FOLDER = path.join(OUTPUT_FOLDER, "version", "CustomLevels");
const SHARED_FOLDER = path.join(OUTPUT_FOLDER, "shared");
const SHARED_CUSTOM_LEVELS_FOLDER = path.join(SHARED_FOLDER, "CustomLevels");

jest.mock("electron", () => ({ app: {
    getPath: () => "",
    getName: () => "",
}}));
jest.mock("electron-log", () => ({
    info: jest.fn(),
    error: jest.fn(),
}));

const service = createFolderLinkerServiceV2({
    installLocationService: {
        installationDirectory: () => OUTPUT_FOLDER,
        sharedContentPath: () => SHARED_FOLDER,
    }
});

const createMockMapFiles = async (
    folder: string,
    start: number,
    end: number
): Promise<void> => {
    for (let i = start; i < end; ++i) {
        const folderPath = path.join(folder, `map-${i.toString().padStart(4, "0")}`);
        await mkdir(folderPath, { recursive: true });

        for (let j = 0; j < 3; ++j) {
            const filePath = path.join(folderPath, `file-${j}.txt`);
            await writeFile(filePath, randomUUID());
        }
    }
}

describe("Folder Linker Service", () => {

    beforeAll(async () => {
        await rm(OUTPUT_FOLDER, { force: true, recursive: true });
        await createMockMapFiles(SHARED_CUSTOM_LEVELS_FOLDER, 0, 5000);
        await createMockMapFiles(VERSION_FOLDER, 5000, 10_000);
    }, 60_000); // 1min

    afterAll(async () => {
        await rm(OUTPUT_FOLDER, { force: true, recursive: true });
    });

    it("link folder test", async () => {
        await service.linkFolder(VERSION_FOLDER, {
            backup: true,
            keepContents: true,
        });

        for (const folder of [ SHARED_CUSTOM_LEVELS_FOLDER, VERSION_FOLDER ]) {
            const mapFolders = await readdir(folder, { withFileTypes: true });
            expect(mapFolders.length).toBe(10_000);

            for (const map of mapFolders) {
                const mapPath = path.join(folder, path.basename(map.name));
                const contents = await readdir(mapPath, { withFileTypes: true });
                expect(contents.length).toBe(3);
            }
        }
    }, 60_000); // 1min

});

