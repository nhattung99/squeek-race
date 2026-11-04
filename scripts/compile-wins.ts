import { createRequire } from "node:module";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const solc = require("solc") as {
  version(): string;
  compile(
    input: string,
    callbacks: { import(path: string): { contents?: string; error?: string } },
  ): string;
};
export function compileWins() {
  const output = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: {
          "SqueekRaceWins.sol": {
            content: readFileSync("contracts/SqueekRaceWins.sol", "utf8"),
          },
        },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun",
          outputSelection: {
            "*": {
              "*": [
                "abi",
                "evm.bytecode.object",
                "evm.deployedBytecode.object",
                "evm.deployedBytecode.immutableReferences",
                "metadata",
              ],
            },
          },
        },
      }),
      {
        import(path) {
          if (
            !path.startsWith("@openzeppelin/contracts/") ||
            path.includes("..")
          )
            return { error: "Unsupported import" };
          return {
            contents: readFileSync(resolve("node_modules", path), "utf8"),
          };
        },
      },
    ),
  );
  const errors = output.errors?.filter(
    (e: { severity: string }) => e.severity === "error",
  );
  if (errors?.length) throw new Error(JSON.stringify(errors));
  return {
    compiler: solc.version(),
    ...output.contracts["SqueekRaceWins.sol"].SqueekRaceWins,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/SqueekRaceWins.json",
    JSON.stringify(compileWins(), null, 2),
  );
  console.log(
    "Compiled artifacts/SqueekRaceWins.json. No deployment or transaction was performed.",
  );
}
