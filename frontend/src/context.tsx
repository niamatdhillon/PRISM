import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { Me, Staff, StudyInfo } from "./types";

interface Ctx { study: StudyInfo | null; studyError: string | null; me: Me | null; staff: Staff | null; refreshMe: () => Promise<void>; refreshStaff: () => Promise<void>; refreshStudy: () => Promise<void>; ready: boolean }
const C = createContext<Ctx>({ study: null, studyError: null, me: null, staff: null, refreshMe: async () => undefined, refreshStaff: async () => undefined, refreshStudy: async () => undefined, ready: false });
export const useApp = () => useContext(C);

export function AppProvider({ children }: { children: ReactNode }) {
  const [study, setStudy] = useState<StudyInfo | null>(null); const [studyError, setStudyError] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null); const [staff, setStaff] = useState<Staff | null>(null); const [ready, setReady] = useState(false);
  const refreshStudy = useCallback(async () => { try { setStudy(await api.study()); setStudyError(null); } catch (e) { setStudyError((e as Error).message); } }, []);
  const refreshMe = useCallback(async () => { try { setMe(await api.me()); } catch (e) { if (e instanceof ApiError && e.status === 401) setMe(null); } }, []);
  const refreshStaff = useCallback(async () => { try { setStaff(await api.staff()); } catch (e) { if (e instanceof ApiError && e.status === 401) setStaff(null); } }, []);
  useEffect(() => { Promise.all([refreshStudy(), refreshMe(), refreshStaff()]).finally(() => setReady(true)); }, [refreshStudy, refreshMe, refreshStaff]);
  return <C.Provider value={{ study, studyError, me, staff, refreshMe, refreshStaff, refreshStudy, ready }}>{children}</C.Provider>;
}
