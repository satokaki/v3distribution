import React from "react";
import { X } from "lucide-react";
import { buildTransactionHtml, printTransaction } from "@/components/PrintTransaction";

/**
 * Preview cetak nota. isDraft → watermark DRAFT. Tidak mengubah status/stok/kas.
 * Tombol: Kembali, Cetak.
 */
export default function TransactionPrintPreview({
  open,
  onClose,
  transaction,
  documentType,
  isDraft = false,
}) {
  if (!open || !transaction) return null;
  const html = buildTransactionHtml(transaction, documentType, isDraft);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-card rounded-2xl shadow-2xl border border-border">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Preview Cetak</h2>
            {isDraft && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                DRAFT — BELUM DIPOSTING
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-hidden bg-muted/30">
          <iframe
            title="preview-cetak"
            srcDoc={html}
            className="w-full h-full min-h-[60vh] border-0 bg-white"
          />
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-accent"
          >
            Kembali
          </button>
          <button
            onClick={() => printTransaction(transaction, documentType, isDraft)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Cetak
          </button>
        </div>
      </div>
    </div>
  );
}