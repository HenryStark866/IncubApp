import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';

export const useMachineDossier = (machineId, orgId) => {
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFullDossier = useCallback(async () => {
    if (!machineId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: summary, error: sumErr } = await supabase
        .from('machine_sig_summary')
        .select('*')
        .eq('machine_id', machineId)
        .eq('org_id', orgId)
        .single();

      if (sumErr) throw sumErr;

      const { data: otHistory, error: otErr } = await supabase
        .from('work_orders')
        .select('*, profiles(full_name)')
        .eq('machine_id', machineId)
        .eq('org_id', orgId)
        .order('created_at', { ascending: false });

      if (otErr) throw otErr;

      const { data: calibrations, error: calErr } = await supabase
        .from('machine_calibrations')
        .select('*, profiles(full_name)')
        .eq('machine_id', machineId)
        .eq('org_id', orgId)
        .order('calibrated_at', { ascending: false });

      if (calErr) throw calErr;

      setDossier({
        summary,
        history: otHistory,
        calibrations,
      });
    } catch (err) {
      console.error('Error fetching machine dossier:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [machineId, orgId]);

  useEffect(() => {
    fetchFullDossier();
  }, [fetchFullDossier]);

  return { dossier, loading, error, refresh: fetchFullDossier };
};
