import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function integer(value: string) {
  return BigInt(value).toLocaleString("en-US");
}
export function milli(value: number) {
  return `${Math.floor(value / 1000)}.${Math.floor((value % 1000) / 100)}`;
}
