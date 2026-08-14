import React, { useState, useRef, useEffect } from "react";
import { useBranchContext } from "@/lib/BranchContext";
import { ChevronDown, Building2, Check } from "lucide-react";

export default function BranchSelector() {
  const { isSuperAdmin, canSwitchBranch, accessibleBranches, readScopeBranchId, setReadScopeBranchId, isAllBranches } = useBranchContext();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const activeName = accessibleBranches.find((b) => b.branch_id === readScopeBranchId)?.branch_name;
  const currentLabel = isAllBranches ? "Semua Cabang" : activeName || (accessibleBranches[0]?.branch_name || "—");
  const showSelector = canSwitchBranch;

  if (!showSelector) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm">
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium">{currentLabel}</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background hover:bg-accent text-sm max-w-[200px]"
      >
        <Building2 className="w-4 h-4 shrink-0 text-muted-foreground" />
        <span className="hidden sm:inline text-xs text-muted-foreground">Cabang:</span>
        <span className="font-medium truncate">{currentLabel}</span>
        <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-60 rounded-lg border border-border bg-card shadow-lg z-50 py-1 max-h-72 overflow-y-auto">
          {isSuperAdmin && (
            <button
              onClick={() => { setReadScopeBranchId("all"); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent text-left"
            >
              <span className="font-medium">Semua Cabang</span>
              {isAllBranches && <Check className="w-4 h-4 text-primary" />}
            </button>
          )}
          {isSuperAdmin && accessibleBranches.length > 0 && <div className="border-t border-border my-1" />}
          {accessibleBranches.map((b) => (
            <button
              key={b.branch_id}
              onClick={() => { setReadScopeBranchId(b.branch_id); setOpen(false); }}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent text-left"
            >
              <span className="flex flex-col items-start">
                <span className="font-medium">{b.branch_name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {b.branch_code} · {b.is_branch_manager ? "Kepala Cabang" : b.assignment_role || ""}
                </span>
              </span>
              {readScopeBranchId === b.branch_id && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
          {accessibleBranches.length === 0 && !isSuperAdmin && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Tidak ada cabang ditugaskan</div>
          )}
        </div>
      )}
    </div>
  );
}
