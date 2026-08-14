import React from "react";
import PageHeader from "@/components/PageHeader";
import { Construction, CheckCircle2 } from "lucide-react";

export default function BlueprintModule({ title, description, capabilities = [] }) {
  return (
    <div>
      <PageHeader title={title} subtitle={description} action={null} />
      <div className="rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-xl bg-primary/10 p-3 text-primary"><Construction className="h-6 w-6" /></div>
          <div>
            <h2 className="font-semibold">Modul terdaftar dalam blueprint V3</h2>
            <p className="mt-1 text-sm text-muted-foreground">Akses halaman ini sudah mengikuti role dan cabang user. Proses bisnis serta entity transaksi akan dilengkapi pada tahap modul.</p>
          </div>
        </div>
        {capabilities.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {capabilities.map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-lg border border-border p-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />{item}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
