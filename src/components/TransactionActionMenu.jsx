import React from "react";
import { MoreHorizontal, Eye, Pencil, Printer, Send, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

/**
 * Menu aksi transaksi standar.
 * Draft  : View, Edit, Preview Cetak, Posting, Delete
 * Posted : View, Cetak
 */
export default function TransactionActionMenu({
  row,
  onView,
  onEdit,
  onPreview,
  onPost,
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
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onView && onView(row)}>
          <Eye className="w-4 h-4 mr-2" /> View
        </DropdownMenuItem>
        {isDraft && onEdit && (
          <DropdownMenuItem onClick={() => onEdit(row)}>
            <Pencil className="w-4 h-4 mr-2" /> Edit
          </DropdownMenuItem>
        )}
        {isDraft && onPreview && (
          <DropdownMenuItem onClick={() => onPreview(row)}>
            <Printer className="w-4 h-4 mr-2" /> Preview Cetak
          </DropdownMenuItem>
        )}
        {isPosted && onPreview && (
          <DropdownMenuItem onClick={() => onPreview(row)}>
            <Printer className="w-4 h-4 mr-2" /> Cetak
          </DropdownMenuItem>
        )}
        {isDraft && canPost && onPost && (
          <DropdownMenuItem onClick={() => onPost(row)}>
            <Send className="w-4 h-4 mr-2" /> Posting
          </DropdownMenuItem>
        )}
        {isDraft && onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(row)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}