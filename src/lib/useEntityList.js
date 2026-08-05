import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";
import { generateCode } from "@/lib/utils";

/**
 * Shared hook for entity list + CRUD + auto code generation.
 */
export function useEntityList(entityName, { codePrefix, codePad = 4 } = {}) {
  const { toast } = useToast();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await base44.entities[entityName].list("-created_date", 500);
      setData(items || []);
    } catch (err) {
      toast({ title: "Gagal memuat data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [entityName, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (payload) => {
    const finalPayload = { ...payload };
    if (codePrefix && !finalPayload.code && !finalPayload.sku) {
      finalPayload.code = generateCode(codePrefix, data.length, codePad);
    }
    await base44.entities[entityName].create(finalPayload);
    toast({ title: "Data berhasil ditambahkan" });
    await load();
  };

  const update = async (id, payload) => {
    await base44.entities[entityName].update(id, payload);
    toast({ title: "Data berhasil diperbarui" });
    await load();
  };

  const remove = async (id) => {
    await base44.entities[entityName].delete(id);
    toast({ title: "Data berhasil dihapus" });
    await load();
  };

  const nextCode = () => generateCode(codePrefix, data.length, codePad);

  return { data, loading, create, update, remove, reload: load, nextCode };
}