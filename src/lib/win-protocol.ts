import {
  keccak256,
  stringToHex,
  parseAbi,
  defineChain,
  type Address,
  type Hex,
} from "viem";
export const WIN_CHAIN_ID = 11155111;
export const winChain = defineChain({
  id: WIN_CHAIN_ID,
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://ethereum-sepolia-rpc.publicnode.com"] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: "https://sepolia.etherscan.io" },
  },
  testnet: true,
});
export const winAbi = parseAbi([
  "function attestor() view returns (address)",
  "function wins(bytes32) view returns (address player, bytes32 resultDigest)",
  "function recordWin((bytes32 matchId,address player,bytes32 resultDigest,uint256 expiresAt) win, bytes signature)",
  "event WinRecorded(bytes32 indexed matchId,address indexed player,bytes32 resultDigest)",
]);
export const winTypes = {
  Win: [
    { name: "matchId", type: "bytes32" },
    { name: "player", type: "address" },
    { name: "resultDigest", type: "bytes32" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;
export type WinVoucher = {
  matchId: Hex;
  player: Address;
  resultDigest: Hex;
  expiresAt: string;
};
export function winTypedData(registry: Address, voucher: WinVoucher) {
  return {
    domain: {
      name: "SqueekRace Arena",
      version: "1",
      chainId: WIN_CHAIN_ID,
      verifyingContract: registry,
    },
    types: winTypes,
    primaryType: "Win" as const,
    message: { ...voucher, expiresAt: BigInt(voucher.expiresAt) },
  };
}
export function matchKey(id: string) {
  return keccak256(stringToHex(id));
}
export function walletChallenge(
  origin: string,
  matchId: string,
  wallet: Address,
  nonce: string,
  expires: number,
) {
  return `${origin} requests a SqueekRace Arena victory receipt.\nWallet: ${wallet}\nMatch: ${matchId}\nChain ID: ${WIN_CHAIN_ID}\nNonce: ${nonce}\nExpires: ${new Date(expires).toISOString()}\n\nBind this wallet to this server-confirmed win. This signature sends no transaction and grants no token allowance.`;
}
