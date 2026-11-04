import { getAddress, isAddress } from "viem";

export function GET() {
  const address = process.env.WIN_REGISTRY_ADDRESS;
  const codeHash = process.env.WIN_REGISTRY_CODE_HASH;
  const config =
    address &&
    isAddress(address) &&
    codeHash &&
    /^0x[0-9a-fA-F]{64}$/.test(codeHash)
      ? {
          enabled: true,
          registry: getAddress(address),
          codeHash: codeHash.toLowerCase(),
        }
      : { enabled: false };
  return Response.json(config, { headers: { "Cache-Control": "no-store" } });
}
