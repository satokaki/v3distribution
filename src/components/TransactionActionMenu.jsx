import React from "react";
import { MoreHorizontal, Eye, Pencil, Send, Printer, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * Menu aksi transaksi standar.
 * Draft: Lihat, Edit, Posting, Hapus Draft.
 * Posted: Lihat, Cetak.
 * Void/Cancelled: Lihat, Cetak.
 */
export default function TransactionActionMenu({
  row,
  onView,
  onEdit,
  onPost,
  onPrint,
  onDelete,
  canPost = true,
}) {
  const status = row?.status;
  const isDraft = status === "draft";
  const isPosted = status === "posted";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground"
          aria-label="Aksi"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onClick={() => onView && onView(row)}>
          <Eye className="w-4 h-4 mr-2" /> Lihat
        </DropdownMenuItem>
        {isDraft && onEdit && (
          <DropdownMenuItem onClick={() => onEdit(row)}>
            <Pencil className="w-4 h-4 mr-2" /> Edit
          </DropdownMenuItem>
        )}
        {isDraft && canPost && onPost && (
          <DropdownMenuItem onClick={() => onPost(row)}>
            <Send className="w-4 h-4 mr-2" /> Posting
          </DropdownMenuItem>
        )}
        {(isPosted || status === "void" || status === "cancelled") && onPrint && (
          <DropdownMenuItem onClick={() => onPrint(row)}>
            <Printer className="w-4 h-4 mr-2" /> Cetak
          </DropdownMenuItem>
        )}
        {isDraft && onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(row)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Hapus Draft
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}