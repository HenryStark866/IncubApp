import { useState, useEffect } from 'react';
import { supabase } from '../../core/supabase';

export const useMachineDossier = (machineId) => {
  const [dossier, setDossier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchFullDossier = async () => {
    if (!machineId) return;
    setLoading(true);
    setError(null);

    try {
      const { data: summary, error: sumErr } = await supabase
        .from('machine_sig_summary')
        .select('*')
        .eq('machine_id', machineId)
        .single();

      if (sumErr) throw sumErr;

      const { data: otHistory, error: otErr } = await supabase
        .from('work_orders')
        .select('*, profiles(full_name)')
        .eq('machine_id', machineId)
        .order('created_at', { ascending: false });

      if (otErr) throw otErr;

      const { data: calibrations, error: calErr } = await supabase
        .from('machine_calibrations')
        .select('*, profiles(full_name)')
        .eq('machine_id', machineId)
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
  };

  useEffect(() => {
    fetchFullDossier();
  }, [machineId]);

  return { dossier, loading, error, refresh: fetchFullDossier };
};
