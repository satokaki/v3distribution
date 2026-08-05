import React from "react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(n) {
  if (n == null || isNaN(n)) return "Rp 0";
  return "Rp " + Number(n).toLocaleString("id-ID");
}

export function formatNumber(n) {
  if (n == null || isNaN(n)) return "0";
  return Number(n).toLocaleString("id-ID");
}

// Generate sequential codes like CBG-0001 based on existing count
export function generateCode(prefix, existingCount, padLength = 4) {
  const next = (existingCount || 0) + 1;
  return `${prefix}-${String(next).padStart(padLength, "0")}`;
}

// Branch short code from name (e.g. "Jember" -> "JBR")
export function branchCodeFromName(name) {
  if (!name) return "";
  const clean = name.trim().toUpperCase().replace(/[^A-Z]/g, "");
  if (clean.length >= 3) return clean.slice(0, 3);
  return clean.padEnd(3, "X");
}