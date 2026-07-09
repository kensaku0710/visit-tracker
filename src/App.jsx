import { useState, useEffect, useMemo } from "react";
import { Plus, Gauge, History, Trash2, ChevronLeft, ChevronRight, Check, Users, CalendarClock, Settings } from "lucide-react";

const DEFAULT_THRESHOLD_HOURS = 81;
const DEFAULT_RATE_PER_UNIT = 4200;

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function pad(n) { return String(n).padStart(2, "0"); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function monthKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
function minutesToHM(min) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}時間${m > 0 ? m + "分" : ""}`;
}
function withSama(name) {
  if (!name) return name;
  return name.endsWith("様") ? name : `${name}様`;
}
function recordLabel(r) {
  if (r.category === "other") return r.memo || "その他";
  return r.memo ? `リハビリ・${withSama(r.memo)}` : "リハビリ";
}

export default function VisitTracker() {
  const [tab, setTab] = useState("input");
  const [records, setRecords] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [viewMonth, setViewMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()));
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherMinutes, setOtherMinutes] = useState("");
  const [otherMemo, setOtherMemo] = useState("");
  const [inputRehabName, setInputRehabName] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedDate, setExpandedDate] = useState(null);
  const [weeklyTemplate, setWeeklyTemplate] = useState({ 1: [], 2: [], 3: [], 4: [], 5: [] });
  const [templateWeekday, setTemplateWeekday] = useState(1);
  const [tplOtherOpen, setTplOtherOpen] = useState(false);
  const [tplOtherMinutes, setTplOtherMinutes] = useState("");
  const [tplOtherMemo, setTplOtherMemo] = useState("");
  const [tplRehabName, setTplRehabName] = useState("");
  const [applyFromDate, setApplyFromDate] = useState(toDateStr(new Date()));
  const [applyMessage, setApplyMessage] = useState("");
  const [thresholdHours, setThresholdHours] = useState(DEFAULT_THRESHOLD_HOURS);
  const [ratePerUnit, setRatePerUnit] = useState(DEFAULT_RATE_PER_UNIT);
  const [draftItems, setDraftItems] = useState([]);
  const [draftOtherOpen, setDraftOtherOpen] = useState(false);
  const [draftOtherMinutes, setDraftOtherMinutes] = useState("");
  const [draftOtherMemo, setDraftOtherMemo] = useState("");
  const [draftRehabName, setDraftRehabName] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("records", false);
        if (res && res.value) setRecords(JSON.parse(res.value));
      } catch (e) {
        // no existing data yet
      }
      try {
        const res2 = await window.storage.get("weeklyTemplate", false);
        if (res2 && res2.value) setWeeklyTemplate(JSON.parse(res2.value));
      } catch (e) {
        // no existing template yet
      }
      try {
        const res3 = await window.storage.get("incentiveSettings", false);
        if (res3 && res3.value) {
          const s = JSON.parse(res3.value);
          if (s.thresholdHours) setThresholdHours(s.thresholdHours);
          if (s.ratePerUnit) setRatePerUnit(s.ratePerUnit);
        }
      } catch (e) {
        // no existing settings yet
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  const persist = async (next) => {
    setRecords(next);
    setSaving(true);
    try {
      await window.storage.set("records", JSON.stringify(next), false);
    } catch (e) {
      console.error("保存に失敗しました", e);
    } finally {
      setSaving(false);
    }
  };

  const today = new Date();
  const todayStr = toDateStr(today);
  const isFuture = (d) => d > todayStr;
  // status:"planned" は明示的な予定（未実施）。古いデータで status が無い場合は
  // 従来通り「未来日なら予定」とみなして後方互換を保つ
  const isPlannedRecord = (r) => r.status === "planned" || (r.status === undefined && isFuture(r.date));

  const addRecord = (category, duration, memo = "") => {
    const rec = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: selectedDate,
      category,
      duration,
      memo,
      status: "actual",
    };
    persist([...records, rec]);
  };

  const deleteRecord = (id) => {
    persist(records.filter((r) => r.id !== id));
  };

  const confirmRecord = (id) => {
    persist(records.map((r) => (r.id === id ? { ...r, status: "actual" } : r)));
  };

  const confirmDay = (date) => {
    persist(records.map((r) => (r.date === date && isPlannedRecord(r) ? { ...r, status: "actual" } : r)));
  };

  const confirmAllPastPlannedInMonth = () => {
    persist(
      records.map((r) =>
        r.date.startsWith(currentMonthKey) && r.date <= todayStr && isPlannedRecord(r)
          ? { ...r, status: "actual" }
          : r
      )
    );
  };

  const hasCommitted = useMemo(
    () => records.some((r) => r.date === selectedDate && !isPlannedRecord(r)),
    [records, selectedDate, todayStr]
  );
  const selectedWeekday = useMemo(() => {
    const [y, m, d] = selectedDate.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }, [selectedDate]);

  useEffect(() => {
    if (!loaded) return;
    const dateRecords = records.filter((r) => r.date === selectedDate);
    const actualExisting = dateRecords.filter((r) => !isPlannedRecord(r));
    if (actualExisting.length > 0) {
      setDraftItems([]);
      return;
    }
    const plannedExisting = dateRecords.filter((r) => isPlannedRecord(r));
    if (plannedExisting.length > 0) {
      setDraftItems(
        plannedExisting.map((r) => ({
          id: `existing-${r.id}`,
          recordId: r.id,
          category: r.category,
          duration: r.duration,
          memo: r.memo || "",
          cancelled: false,
          fromTemplate: true,
        }))
      );
      return;
    }
    const [y, m, d] = selectedDate.split("-").map(Number);
    const wd = new Date(y, m - 1, d).getDay();
    const items = weeklyTemplate[wd] || [];
    setDraftItems(
      items.map((t) => ({
        id: `draft-${t.id}`,
        recordId: null,
        category: t.category,
        duration: t.duration,
        memo: t.memo || "",
        cancelled: false,
        fromTemplate: true,
      }))
    );
    // 意図的に selectedDate / loaded にのみ依存させ、入力中の下書きが
    // 他の記録変更やテンプレート編集で勝手にリセットされないようにする
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, loaded]);

  const toggleCancelDraftItem = (id) => {
    setDraftItems((prev) => prev.map((it) => (it.id === id ? { ...it, cancelled: !it.cancelled } : it)));
  };

  const removeDraftItem = (id) => {
    setDraftItems((prev) => prev.filter((it) => it.id !== id));
  };

  const addDraftItem = (category, duration, memo = "") => {
    setDraftItems((prev) => [
      ...prev,
      { id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, recordId: null, category, duration, memo, cancelled: false, fromTemplate: false },
    ]);
  };

  const registerDay = () => {
    const kept = draftItems.filter((it) => !it.cancelled);
    const cancelledIds = new Set(draftItems.filter((it) => it.cancelled && it.recordId).map((it) => it.recordId));

    const updatedExisting = records
      .filter((r) => !cancelledIds.has(r.id)) // キャンセルされた予定は削除
      .map((r) => {
        const match = kept.find((it) => it.recordId === r.id);
        return match ? { ...r, status: "actual" } : r; // 継続する予定は実績に確定
      });

    const brandNew = kept
      .filter((it) => !it.recordId)
      .map((it) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        date: selectedDate,
        category: it.category,
        duration: it.duration,
        memo: it.memo,
        status: "actual",
      }));

    persist([...updatedExisting, ...brandNew]);
    setDraftItems([]);
  };

  const persistTemplate = async (next) => {
    setWeeklyTemplate(next);
    try {
      await window.storage.set("weeklyTemplate", JSON.stringify(next), false);
    } catch (e) {
      console.error("テンプレート保存に失敗しました", e);
    }
  };

  const addTemplateItem = (category, duration, memo = "") => {
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, category, duration, memo };
    const next = { ...weeklyTemplate, [templateWeekday]: [...(weeklyTemplate[templateWeekday] || []), item] };
    persistTemplate(next);
  };

  const removeTemplateItem = (wd, id) => {
    const next = { ...weeklyTemplate, [wd]: (weeklyTemplate[wd] || []).filter((t) => t.id !== id) };
    persistTemplate(next);
  };

  const persistSettings = async (nextThresholdHours, nextRate) => {
    setThresholdHours(nextThresholdHours);
    setRatePerUnit(nextRate);
    try {
      await window.storage.set(
        "incentiveSettings",
        JSON.stringify({ thresholdHours: nextThresholdHours, ratePerUnit: nextRate }),
        false
      );
    } catch (e) {
      console.error("設定の保存に失敗しました", e);
    }
  };

  const currentMonthKey = monthKey(viewMonth);
  const monthRecords = useMemo(
    () => records.filter((r) => r.date.startsWith(currentMonthKey)),
    [records, currentMonthKey]
  );
  const actualRecords = useMemo(() => monthRecords.filter((r) => !isPlannedRecord(r)), [monthRecords, todayStr]);
  const plannedRecords = useMemo(() => monthRecords.filter((r) => isPlannedRecord(r)), [monthRecords, todayStr]);
  const pastPlannedRecords = useMemo(() => plannedRecords.filter((r) => r.date <= todayStr), [plannedRecords, todayStr]);

  const THRESHOLD_MIN = (Number(thresholdHours) || DEFAULT_THRESHOLD_HOURS) * 60;
  const totalMinutes = actualRecords.reduce((s, r) => s + Number(r.duration), 0);
  const plannedMinutes = plannedRecords.reduce((s, r) => s + Number(r.duration), 0);
  const rehabMinutes = actualRecords.filter((r) => r.category !== "other").reduce((s, r) => s + Number(r.duration), 0);
  const otherTotalMinutes = totalMinutes - rehabMinutes;
  const excess = Math.max(0, totalMinutes - THRESHOLD_MIN);
  const incentive = Math.floor(excess / 60) * (Number(ratePerUnit) || DEFAULT_RATE_PER_UNIT);
  const pct = Math.min(100, (totalMinutes / THRESHOLD_MIN) * 100);

  const isCurrentMonth = currentMonthKey === monthKey(today);
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const elapsedDays = isCurrentMonth ? today.getDate() : daysInMonth;
  const remainingDays = isCurrentMonth ? daysInMonth - elapsedDays : 0;
  const projected = elapsedDays > 0 ? (totalMinutes / elapsedDays) * daysInMonth : 0;
  const neededPerDay = remainingDays > 0 ? Math.max(0, THRESHOLD_MIN - totalMinutes) / remainingDays : null;
  const forecastTotal = totalMinutes + plannedMinutes;

  const applyTemplateToMonth = () => {
    const newRecords = [];
    let filledDays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const dt = new Date(year, month, day);
      const wd = dt.getDay();
      const dstr = toDateStr(dt);
      if (wd < 1 || wd > 5) continue;
      if (dstr < applyFromDate) continue; // 反映開始日より前はスキップ
      const hasExisting = records.some((r) => r.date === dstr);
      if (hasExisting) continue; // すでに記録（実績・予定とも）がある日はスキップ
      const items = weeklyTemplate[wd] || [];
      if (items.length === 0) continue;
      items.forEach((t) => {
        newRecords.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${day}`,
          date: dstr,
          category: t.category,
          duration: t.duration,
          memo: t.memo || "",
          status: "planned", // 過去日でも自動で実績にはせず、必ず「入力」タブでの登録を経由させる
        });
      });
      filledDays++;
    }
    if (newRecords.length) persist([...records, ...newRecords]);
    setApplyMessage(filledDays > 0 ? `${filledDays}日分の予定を反映しました` : "反映できる日がありませんでした（記録済みの日はスキップされます）");
    setTimeout(() => setApplyMessage(""), 3000);
  };

  const dayTotals = useMemo(() => {
    const map = {};
    monthRecords.forEach((r) => {
      map[r.date] = (map[r.date] || 0) + Number(r.duration);
    });
    return map;
  }, [monthRecords]);

  const dayHasPlanned = useMemo(() => {
    const map = {};
    monthRecords.forEach((r) => {
      if (isPlannedRecord(r)) map[r.date] = true;
    });
    return map;
  }, [monthRecords, todayStr]);

  const changeMonth = (delta) => {
    setViewMonth(new Date(year, month + delta, 1));
  };

  const heatLevel = (min) => {
    if (!min) return "lvl0";
    if (min <= 40) return "lvl1";
    if (min <= 80) return "lvl2";
    if (min <= 120) return "lvl3";
    return "lvl4";
  };

  const sortedHistory = [...monthRecords].sort((a, b) => (a.date < b.date ? 1 : -1));

  const ringCirc = 2 * Math.PI * 54;
  const ringOffset = ringCirc - (pct / 100) * ringCirc;
  const achieved = totalMinutes >= THRESHOLD_MIN;

  return (
    <div className="app-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap');
        .app-root {
          font-family: 'Zen Kaku Gothic New', sans-serif;
          background: #F6F4EF;
          min-height: 100vh;
          color: #2A2822;
          display: flex;
          justify-content: center;
        }
        .shell { width: 100%; max-width: 480px; min-height: 100vh; display: flex; flex-direction: column; }
        .display-num { font-family: 'Shippori Mincho', serif; }
        .header {
          padding: 22px 20px 16px;
          border-bottom: 1px solid #E8E4DC;
          background: #F6F4EF;
          position: sticky; top: 0; z-index: 10;
        }
        .header-title { font-size: 14px; letter-spacing: 0.08em; color: #8B8579; }
        .header-month { display: flex; align-items: center; gap: 10px; margin-top: 4px; }
        .header-month button { color: #3C7A6E; background: none; border: none; cursor: pointer; padding: 4px; }
        .header-month button:focus-visible { outline: 2px solid #3C7A6E; border-radius: 6px; }
        .header-month h1 { font-size: 22px; font-weight: 700; font-family: 'Shippori Mincho', serif; }
        .content { flex: 1; padding: 20px; padding-bottom: 96px; }
        .card {
          background: #FFFFFF;
          border: 1px solid #E8E4DC;
          border-radius: 16px;
          padding: 20px;
          margin-bottom: 16px;
        }
        .tag-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .tag-btn {
          border-radius: 14px;
          padding: 20px 12px;
          font-size: 16px;
          font-weight: 700;
          border: 1.5px solid #CFE3DD;
          background: #E5F0EC;
          color: #2F6459;
          cursor: pointer;
          transition: transform .1s ease, background .15s ease;
        }
        .tag-btn:active { transform: scale(0.97); }
        .tag-btn:focus-visible { outline: 2px solid #3C7A6E; outline-offset: 2px; }
        .tag-btn.other { background: #F5E6DC; border-color: #E8CBB3; color: #9C5A34; grid-column: span 2; }
        .date-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
        .date-row input[type=date] {
          font-family: 'Zen Kaku Gothic New', sans-serif;
          border: 1px solid #E8E4DC; border-radius: 10px; padding: 8px 10px; background: #FBFAF7;
          color: #2A2822; font-size: 14px;
        }
        .other-form { margin-top: 14px; padding-top: 14px; border-top: 1px dashed #E8CBB3; }
        .chip-row { display: flex; gap: 8px; margin-bottom: 10px; flex-wrap: wrap; }
        .chip {
          padding: 8px 14px; border-radius: 999px; border: 1px solid #E8CBB3;
          background: #FBFAF7; color: #9C5A34; font-size: 13px; cursor: pointer;
        }
        .chip.active { background: #C67A54; color: #fff; border-color: #C67A54; }
        .other-form input[type=number], .other-form input[type=text] {
          width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 10px;
          border: 1px solid #E8E4DC; margin-bottom: 10px; font-size: 15px; font-family: inherit;
          background: #FBFAF7;
        }
        .add-btn {
          width: 100%; padding: 12px; border-radius: 10px; border: none;
          background: #C67A54; color: #fff; font-weight: 700; font-size: 15px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .add-btn:focus-visible { outline: 2px solid #9C5A34; outline-offset: 2px; }
        .today-list { margin-top: 6px; }
        .today-item {
          display: flex; justify-content: space-between; align-items: center;
          padding: 10px 0; border-bottom: 1px solid #F0EEE7; font-size: 14px;
        }
        .today-item:last-child { border-bottom: none; }
        .today-item button { background: none; border: none; color: #B25450; cursor: pointer; padding: 4px; }
        .muted { color: #8B8579; font-size: 13px; }
        .ring-wrap { display: flex; flex-direction: column; align-items: center; padding: 8px 0 4px; }
        .ring-num { font-size: 34px; font-weight: 700; }
        .ring-sub { font-size: 13px; color: #8B8579; margin-top: 2px; }
        .ring-note { font-size: 11px; color: #B3AE9F; margin-top: 10px; text-align: center; line-height: 1.5; }
        .past-planned-alert {
          margin-top: 10px; background: #F5E6DC; border: 1px solid #E8CBB3; color: #9C5A34;
          font-size: 12px; border-radius: 10px; padding: 10px 12px; text-align: center; line-height: 1.6;
        }
        .past-planned-alert button {
          display: block; margin: 6px auto 0; background: #C67A54; color: #fff; border: none;
          border-radius: 8px; padding: 6px 14px; font-size: 12px; font-weight: 700; cursor: pointer;
        }
        .badge-achieved {
          margin-top: 10px; background: #2F6459; color: #fff; font-size: 13px;
          padding: 6px 14px; border-radius: 999px; font-weight: 700;
        }
        .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
        .stat-box { background: #FBFAF7; border: 1px solid #F0EEE7; border-radius: 12px; padding: 14px; }
        .stat-label { font-size: 12px; color: #8B8579; margin-bottom: 4px; }
        .stat-val { font-size: 20px; font-weight: 700; font-family: 'Shippori Mincho', serif; }
        .pace-box { background: #FBFAF7; border: 1px solid #F0EEE7; border-radius: 12px; padding: 14px; margin-top: 14px; font-size: 14px; line-height: 1.7; }
        .cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin-top: 12px; }
        .cal-wd { text-align: center; font-size: 11px; color: #8B8579; padding-bottom: 4px; }
        .cal-cell {
          aspect-ratio: 1; border-radius: 8px; display: flex; align-items: center; justify-content: center;
          font-size: 11px; color: #2A2822; position: relative;
        }
        .lvl0 { background: #F0EEE7; color: #B3AE9F; }
        .lvl1 { background: #D6E8E2; }
        .lvl2 { background: #A9CFC4; }
        .lvl3 { background: #6FA895; color: #fff; }
        .lvl4 { background: #2F6459; color: #fff; }
        .wd-chip-row { display: flex; gap: 6px; margin-bottom: 16px; }
        .wd-chip {
          flex: 1; padding: 10px 0; text-align: center; border-radius: 10px; border: 1px solid #E8E4DC;
          background: #FBFAF7; color: #8B8579; font-size: 13px; font-weight: 700; cursor: pointer;
        }
        .wd-chip.active { background: #3C7A6E; color: #fff; border-color: #3C7A6E; }
        .tpl-item {
          display: flex; justify-content: space-between; align-items: center;
          background: #FBFAF7; border: 1px solid #F0EEE7; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; font-size: 14px;
        }
        .tpl-item button { background: none; border: none; color: #B25450; cursor: pointer; }
        .tpl-empty { text-align: center; color: #8B8579; font-size: 13px; padding: 18px 0; }
        .tpl-week-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
        .tpl-week-col { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
        .tpl-week-header {
          width: 100%; padding: 8px 0; text-align: center; border-radius: 8px; border: 1px solid #E8E4DC;
          background: #FBFAF7; color: #8B8579; font-size: 12px; font-weight: 700; cursor: pointer;
        }
        .tpl-week-header.active { background: #3C7A6E; color: #fff; border-color: #3C7A6E; }
        .tpl-week-items { display: flex; flex-direction: column; gap: 4px; min-height: 28px; }
        .tpl-week-empty { text-align: center; color: #C9C4B7; font-size: 12px; padding-top: 6px; }
        .tpl-week-chip {
          background: #FBFAF7; border: 1px solid #F0EEE7; border-radius: 8px; padding: 5px 4px;
          display: flex; flex-direction: column; align-items: center; gap: 1px; position: relative;
        }
        .tpl-week-chip-name {
          font-size: 11px; font-weight: 700; color: #2A2822; max-width: 100%;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .tpl-week-chip-dur { font-size: 10px; color: #8B8579; }
        .tpl-week-chip button {
          position: absolute; top: -6px; right: -6px; background: #B25450; color: #fff;
          border: none; border-radius: 999px; width: 16px; height: 16px; display: flex;
          align-items: center; justify-content: center; padding: 0; cursor: pointer;
        }
        .apply-btn {
          width: 100%; padding: 14px; border-radius: 10px; border: none;
          background: #3C7A6E; color: #fff; font-weight: 700; font-size: 15px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px; margin-top: 8px;
        }
        .apply-note { font-size: 12px; color: #8B8579; margin-top: 10px; line-height: 1.6; }
        .settings-label { display: block; font-size: 13px; color: #8B8579; margin-bottom: 8px; font-weight: 700; }
        .settings-row { display: flex; align-items: center; gap: 8px; }
        .settings-row input[type=number] {
          width: 100px; padding: 10px 12px; border-radius: 10px; border: 1px solid #E8E4DC;
          background: #FBFAF7; font-size: 18px; font-family: 'Shippori Mincho', serif; text-align: right;
        }
        .settings-unit { font-size: 13px; color: #2A2822; }
        .settings-preview {
          margin-top: 20px; background: #E5F0EC; border: 1px solid #CFE3DD; color: #2F6459;
          border-radius: 10px; padding: 12px 14px; font-size: 13px; line-height: 1.6;
        }
        .apply-msg {
          margin-top: 10px; background: #E5F0EC; color: #2F6459; font-size: 13px;
          padding: 10px 12px; border-radius: 10px; text-align: center; font-weight: 700;
        }
        .badge-planned {
          display: inline-block; font-size: 10px; font-weight: 700; color: #9C5A34;
          background: #F5E6DC; border: 1px solid #E8CBB3; border-radius: 6px;
          padding: 2px 6px; margin-right: 6px; vertical-align: middle;
        }
        .today-item.is-planned, .hist-item.is-planned {
          background: repeating-linear-gradient(135deg, #FBFAF7, #FBFAF7 8px, #F5EFE6 8px, #F5EFE6 16px);
          border: 1px dashed #E8CBB3;
          border-radius: 10px;
          padding: 10px 12px;
          margin-bottom: 6px;
        }
        .cal-planned { outline: 2px dashed #C67A54; outline-offset: -2px; }
        .confirm-all-btn {
          width: 100%; padding: 10px; border-radius: 10px; border: 1px dashed #3C7A6E;
          background: #E5F0EC; color: #2F6459; font-weight: 700; font-size: 13px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .confirm-day-btn {
          width: 100%; padding: 8px; border-radius: 8px; border: 1px dashed #3C7A6E;
          background: #E5F0EC; color: #2F6459; font-weight: 700; font-size: 12px; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 5px; margin-bottom: 8px;
        }
        .hist-confirm-btn {
          background: #E5F0EC; border: 1px solid #CFE3DD; color: #2F6459; border-radius: 6px;
          width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 0;
        }
        .hist-row {
          width: 100%; display: flex; justify-content: space-between; align-items: center;
          background: none; border: none; padding: 14px 10px; cursor: pointer; font-size: 14px; color: #2A2822;
          font-family: inherit; text-align: left;
        }
        .hist-row:focus-visible { outline: 2px solid #3C7A6E; outline-offset: -2px; border-radius: 8px; }
        .hist-row-date { font-weight: 700; }
        .hist-row-summary { display: flex; align-items: center; gap: 4px; color: #8B8579; font-size: 13px; }
        .hist-chevron { transition: transform .15s ease; }
        .hist-chevron.open { transform: rotate(90deg); }
        .hist-detail { padding: 0 10px 12px; }
        .hist-item {
          display: flex; justify-content: space-between; align-items: center;
          background: #FBFAF7; border: 1px solid #F0EEE7; border-radius: 10px; padding: 10px 12px; margin-bottom: 6px; font-size: 13px;
        }
        .hist-item button { background: none; border: none; color: #B25450; cursor: pointer; }
        .tab-bar {
          position: fixed; bottom: 0; left: 0; right: 0; display: flex; justify-content: center;
          background: #FFFFFF; border-top: 1px solid #E8E4DC; z-index: 20;
        }
        .tab-bar-inner { width: 100%; max-width: 480px; display: flex; }
        .tab-btn {
          flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
          padding: 12px 0 14px; background: none; border: none; cursor: pointer; color: #B3AE9F; font-size: 11px;
        }
        .tab-btn.active { color: #3C7A6E; font-weight: 700; }
        .tab-btn:focus-visible { outline: 2px solid #3C7A6E; }
        .empty-state { text-align: center; padding: 40px 10px; color: #8B8579; font-size: 14px; }
        .draft-item {
          display: flex; justify-content: space-between; align-items: center;
          background: #FBFAF7; border: 1px solid #F0EEE7; border-radius: 10px;
          padding: 12px 14px; margin-bottom: 8px; font-size: 14px;
        }
        .draft-item.cancelled { opacity: 0.5; text-decoration: line-through; }
        .draft-cancel-btn {
          border: 1px solid #E8CBB3; background: #FBFAF7; color: #9C5A34;
          border-radius: 8px; padding: 6px 12px; font-size: 12px; cursor: pointer; white-space: nowrap;
        }
        .draft-item.cancelled .draft-cancel-btn { border-color: #CFE3DD; color: #3C7A6E; }
      `}</style>

      <div className="shell">
        <div className="header">
          <div className="header-title">訪問時間・インセンティブ記録</div>
          {tab !== "input" && tab !== "settings" && (
            <div className="header-month">
              <button onClick={() => changeMonth(-1)} aria-label="前の月"><ChevronLeft size={20} /></button>
              <h1>{year}年 {month + 1}月</h1>
              <button onClick={() => changeMonth(1)} aria-label="次の月"><ChevronRight size={20} /></button>
            </div>
          )}
          {tab === "input" && <div className="header-month"><h1>今日の記録</h1></div>}
          {tab === "settings" && <div className="header-month"><h1>設定</h1></div>}
        </div>

        <div className="content">
          {tab === "input" && (
            <>
              <div className="card">
                <div className="date-row">
                  <span className="muted">対象の日付</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </div>
                {!hasCommitted && (
                  <div className="muted" style={{ lineHeight: 1.6 }}>
                    {WEEKDAYS[new Date(...selectedDate.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v)))).getDay()]}曜日の予定を確認し、
                    キャンセル・追加をしてから最後に登録してください。
                  </div>
                )}
                {hasCommitted && (
                  <div className="muted">この日はすでに登録済みです。必要があれば追加・削除できます。</div>
                )}
              </div>

              {!hasCommitted && (
                <>
                  <div className="card">
                    <div className="muted" style={{ marginBottom: 10 }}>この日の予定</div>
                    {draftItems.length === 0 && (
                      <div className="tpl-empty">この曜日に登録された予定はありません</div>
                    )}
                    {draftItems.map((it) => (
                      <div className={`draft-item ${it.cancelled ? "cancelled" : ""}`} key={it.id}>
                        <span>
                          {it.category === "other" ? (it.memo || "その他") : (it.memo ? `リハビリ・${withSama(it.memo)}` : "リハビリ")}　{it.duration}分
                        </span>
                        {it.fromTemplate ? (
                          <button className="draft-cancel-btn" onClick={() => toggleCancelDraftItem(it.id)}>
                            {it.cancelled ? "取消を戻す" : "キャンセル"}
                          </button>
                        ) : (
                          <button onClick={() => removeDraftItem(it.id)} aria-label="削除"><Trash2 size={16} /></button>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="card">
                    <div className="muted" style={{ marginBottom: 10 }}>予定外の訪問を追加</div>
                    <input
                      type="text"
                      placeholder="利用者名など（任意）"
                      value={draftRehabName}
                      onChange={(e) => setDraftRehabName(e.target.value)}
                      style={{
                        width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10,
                        border: "1px solid #E8E4DC", marginBottom: 12, fontSize: 14, fontFamily: "inherit", background: "#FBFAF7",
                      }}
                    />
                    <div className="tag-grid">
                      <button
                        className="tag-btn"
                        onClick={() => { addDraftItem("rehab40", 40, draftRehabName); setDraftRehabName(""); }}
                      >
                        リハビリ<br />40分
                      </button>
                      <button
                        className="tag-btn"
                        onClick={() => { addDraftItem("rehab60", 60, draftRehabName); setDraftRehabName(""); }}
                      >
                        リハビリ<br />60分
                      </button>
                      <button className="tag-btn other" onClick={() => setDraftOtherOpen((v) => !v)}>
                        <Users size={16} style={{ display: "inline", marginRight: 6, verticalAlign: -3 }} />
                        その他（担当者会議など）
                      </button>
                    </div>

                    {draftOtherOpen && (
                      <div className="other-form">
                        <div className="chip-row">
                          {[30, 60, 90].map((m) => (
                            <button
                              key={m}
                              className={`chip ${draftOtherMinutes === String(m) ? "active" : ""}`}
                              onClick={() => setDraftOtherMinutes(String(m))}
                            >
                              {m}分
                            </button>
                          ))}
                        </div>
                        <input
                          type="number"
                          placeholder="分数を入力（例：45）"
                          value={draftOtherMinutes}
                          onChange={(e) => setDraftOtherMinutes(e.target.value)}
                        />
                        <input
                          type="text"
                          placeholder="内容メモ（担当者会議 など・任意）"
                          value={draftOtherMemo}
                          onChange={(e) => setDraftOtherMemo(e.target.value)}
                        />
                        <button
                          className="add-btn"
                          onClick={() => {
                            if (!draftOtherMinutes || Number(draftOtherMinutes) <= 0) return;
                            addDraftItem("other", Number(draftOtherMinutes), draftOtherMemo);
                            setDraftOtherMinutes("");
                            setDraftOtherMemo("");
                            setDraftOtherOpen(false);
                          }}
                        >
                          <Plus size={16} /> 追加する
                        </button>
                      </div>
                    )}

                    <button
                      className="apply-btn"
                      style={{ marginTop: 18 }}
                      disabled={draftItems.filter((it) => !it.cancelled).length === 0}
                      onClick={registerDay}
                    >
                      <Check size={18} />この日の記録を登録する
                    </button>
                    {draftItems.filter((it) => !it.cancelled).length === 0 && (
                      <div className="apply-note">登録する項目がありません（すべてキャンセル済みか、まだ何も追加していません）</div>
                    )}
                  </div>
                </>
              )}

              {hasCommitted && (
                <div className="card">
                  <div className="muted" style={{ marginBottom: 8 }}>{selectedDate} の記録</div>
                  <div className="today-list">
                    {records
                      .filter((r) => r.date === selectedDate)
                      .map((r) => (
                        <div className={`today-item ${isPlannedRecord(r) ? "is-planned" : ""}`} key={r.id}>
                          <span>
                            {isPlannedRecord(r) && <span className="badge-planned">予定</span>}
                            {recordLabel(r)}　{r.duration}分
                          </span>
                          <button onClick={() => deleteRecord(r.id)} aria-label="削除">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                  </div>

                  <div className="muted" style={{ marginTop: 16, marginBottom: 10 }}>訪問を追加</div>
                  <input
                    type="text"
                    placeholder="利用者名など（任意）"
                    value={inputRehabName}
                    onChange={(e) => setInputRehabName(e.target.value)}
                    style={{
                      width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10,
                      border: "1px solid #E8E4DC", marginBottom: 12, fontSize: 14, fontFamily: "inherit", background: "#FBFAF7",
                    }}
                  />
                  <div className="tag-grid">
                    <button
                      className="tag-btn"
                      onClick={() => { addRecord("rehab40", 40, inputRehabName); setInputRehabName(""); }}
                    >
                      リハビリ<br />40分
                    </button>
                    <button
                      className="tag-btn"
                      onClick={() => { addRecord("rehab60", 60, inputRehabName); setInputRehabName(""); }}
                    >
                      リハビリ<br />60分
                    </button>
                    <button className="tag-btn other" onClick={() => setOtherOpen((v) => !v)}>
                      <Users size={16} style={{ display: "inline", marginRight: 6, verticalAlign: -3 }} />
                      その他（担当者会議など）
                    </button>
                  </div>

                  {otherOpen && (
                    <div className="other-form">
                      <div className="chip-row">
                        {[30, 60, 90].map((m) => (
                          <button
                            key={m}
                            className={`chip ${otherMinutes === String(m) ? "active" : ""}`}
                            onClick={() => setOtherMinutes(String(m))}
                          >
                            {m}分
                          </button>
                        ))}
                      </div>
                      <input
                        type="number"
                        placeholder="分数を入力（例：45）"
                        value={otherMinutes}
                        onChange={(e) => setOtherMinutes(e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="内容メモ（担当者会議 など・任意）"
                        value={otherMemo}
                        onChange={(e) => setOtherMemo(e.target.value)}
                      />
                      <button
                        className="add-btn"
                        onClick={() => {
                          if (!otherMinutes || Number(otherMinutes) <= 0) return;
                          addRecord("other", Number(otherMinutes), otherMemo);
                          setOtherMinutes("");
                          setOtherMemo("");
                          setOtherOpen(false);
                        }}
                      >
                        <Plus size={16} /> 記録する
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {tab === "progress" && (
            <>
              <div className="card">
                <div className="ring-wrap">
                  <svg width="140" height="140" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="#F0EEE7" strokeWidth="10" />
                    <circle
                      cx="60" cy="60" r="54" fill="none"
                      stroke={achieved ? "#C67A54" : "#3C7A6E"}
                      strokeWidth="10"
                      strokeDasharray={ringCirc}
                      strokeDashoffset={ringOffset}
                      strokeLinecap="round"
                      transform="rotate(-90 60 60)"
                      style={{ transition: "stroke-dashoffset .5s ease" }}
                    />
                    <text x="60" y="56" textAnchor="middle" fontSize="20" fontWeight="700" fill="#2A2822" fontFamily="'Shippori Mincho', serif">
                      {pct.toFixed(0)}%
                    </text>
                    <text x="60" y="74" textAnchor="middle" fontSize="10" fill="#8B8579">
                      達成ライン{thresholdHours}h
                    </text>
                  </svg>
                  <div className="ring-num display-num">{minutesToHM(totalMinutes)}</div>
                  {achieved ? (
                    <div className="badge-achieved"><Check size={14} style={{ display: "inline", marginRight: 4, verticalAlign: -2 }} />達成済み・インセンティブ発生中</div>
                  ) : (
                    <div className="ring-sub">{thresholdHours}時間まであと {minutesToHM(THRESHOLD_MIN - totalMinutes)}</div>
                  )}
                  {plannedMinutes > 0 && (
                    <div className="ring-sub" style={{ marginTop: 4 }}>＋予定 {minutesToHM(plannedMinutes)}（未実施）</div>
                  )}
                  {pastPlannedRecords.length > 0 && (
                    <div className="past-planned-alert">
                      確定待ちの過去の予定が {pastPlannedRecords.length}件あります（実績に含まれていません）。
                      <button onClick={confirmAllPastPlannedInMonth}>まとめて実績にする</button>
                    </div>
                  )}
                  <div className="ring-note">※{thresholdHours}時間ちょうどに到達した時点からインセンティブが発生します（{thresholdHours + 1}時間からではありません）</div>
                </div>

                <div className="stat-grid">
                  <div className="stat-box">
                    <div className="stat-label">リハビリ実績</div>
                    <div className="stat-val">{minutesToHM(rehabMinutes)}</div>
                  </div>
                  <div className="stat-box">
                    <div className="stat-label">その他実績</div>
                    <div className="stat-val">{minutesToHM(otherTotalMinutes)}</div>
                  </div>
                  <div className="stat-box" style={{ gridColumn: "span 2" }}>
                    <div className="stat-label">インセンティブ確定額（実績超過 {minutesToHM(excess)}）</div>
                    <div className="stat-val">¥{incentive.toLocaleString()}</div>
                  </div>
                </div>

                {isCurrentMonth && (
                  <div className="pace-box">
                    {plannedMinutes > 0 ? (
                      <>
                        予定を含めた月末見込みは 約 <strong>{minutesToHM(forecastTotal)}</strong> です
                        （実績 {minutesToHM(totalMinutes)} ＋ 予定 {minutesToHM(plannedMinutes)}）。
                        {forecastTotal < THRESHOLD_MIN && (
                          <><br />このままだと{thresholdHours}時間まで {minutesToHM(THRESHOLD_MIN - forecastTotal)} 足りない見込みです。</>
                        )}
                      </>
                    ) : (
                      <>
                        今のペースだと月末に約 <strong>{minutesToHM(Math.round(projected))}</strong> の見込みです。
                      </>
                    )}
                    {achieved && <><br />すでに実績で{thresholdHours}時間を達成しています。</>}
                  </div>
                )}
              </div>

              <div className="card">
                <div className="muted" style={{ marginBottom: 4 }}>カレンダー（1日ごとの合計時間・破線は予定）</div>
                <div className="cal-grid">
                  {WEEKDAYS.map((w) => <div className="cal-wd" key={w}>{w}</div>)}
                  {Array.from({ length: firstWeekday }).map((_, i) => <div key={"e" + i} />)}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dstr = `${year}-${pad(month + 1)}-${pad(day)}`;
                    const min = dayTotals[dstr] || 0;
                    const future = !!dayHasPlanned[dstr];
                    return (
                      <div
                        className={`cal-cell ${heatLevel(min)} ${future && min ? "cal-planned" : ""}`}
                        key={dstr}
                        title={min ? `${min}分${future ? "（予定）" : ""}` : ""}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {tab === "history" && (
            <div className="card" style={{ padding: 8 }}>
              {sortedHistory.length === 0 && <div className="empty-state">この月の記録はまだありません</div>}
              {monthRecords.some((r) => isPlannedRecord(r) && r.date <= todayStr) && (
                <div style={{ padding: "10px 10px 4px" }}>
                  <button className="confirm-all-btn" onClick={confirmAllPastPlannedInMonth}>
                    <Check size={14} />過去の予定をまとめて実績にする
                  </button>
                </div>
              )}
              {Object.entries(
                sortedHistory.reduce((acc, r) => {
                  (acc[r.date] = acc[r.date] || []).push(r);
                  return acc;
                }, {})
              ).map(([date, items], idx, arr) => {
                const dayTotal = items.reduce((s, r) => s + Number(r.duration), 0);
                const isOpen = expandedDate === date;
                const d = new Date(date);
                const label = `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
                const future = items.some((r) => isPlannedRecord(r));
                return (
                  <div key={date} style={{ borderBottom: idx < arr.length - 1 ? "1px solid #F0EEE7" : "none" }}>
                    <button
                      className="hist-row"
                      onClick={() => setExpandedDate(isOpen ? null : date)}
                      aria-expanded={isOpen}
                    >
                      <span className="hist-row-date">
                        {future && <span className="badge-planned">予定</span>}
                        {label}
                      </span>
                      <span className="hist-row-summary">
                        {items.length}件・{dayTotal}分
                        <ChevronRight size={16} className={`hist-chevron ${isOpen ? "open" : ""}`} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="hist-detail">
                        {future && (
                          <button className="confirm-day-btn" onClick={() => confirmDay(date)}>
                            <Check size={13} />この日の予定をまとめて実績にする
                          </button>
                        )}
                        {items.map((r) => (
                          <div className={`hist-item ${isPlannedRecord(r) ? "is-planned" : ""}`} key={r.id}>
                            <span>{recordLabel(r)}　{r.duration}分</span>
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {isPlannedRecord(r) && (
                                <button onClick={() => confirmRecord(r.id)} aria-label="実績にする" className="hist-confirm-btn">
                                  <Check size={14} />
                                </button>
                              )}
                              <button onClick={() => deleteRecord(r.id)} aria-label="削除"><Trash2 size={16} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === "template" && (
            <>
              <div className="card">
                <div className="muted" style={{ marginBottom: 10 }}>1週間の予定（曜日をタップして追加先を選べます）</div>

                <div className="tpl-week-grid">
                  {[1, 2, 3, 4, 5].map((wd) => (
                    <div className="tpl-week-col" key={wd}>
                      <button
                        className={`tpl-week-header ${templateWeekday === wd ? "active" : ""}`}
                        onClick={() => setTemplateWeekday(wd)}
                      >
                        {WEEKDAYS[wd]}
                      </button>
                      <div className="tpl-week-items">
                        {(weeklyTemplate[wd] || []).length === 0 && <div className="tpl-week-empty">-</div>}
                        {(weeklyTemplate[wd] || []).map((t) => (
                          <div className="tpl-week-chip" key={t.id}>
                            <span className="tpl-week-chip-name">
                              {t.category === "other" ? (t.memo || "その他") : (t.memo ? withSama(t.memo) : "リハビリ")}
                            </span>
                            <span className="tpl-week-chip-dur">{t.duration}分</span>
                            <button onClick={() => removeTemplateItem(wd, t.id)} aria-label="削除">
                              <Trash2 size={11} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="muted" style={{ marginTop: 18, marginBottom: 8 }}>
                  {WEEKDAYS[templateWeekday]}曜日に追加
                </div>

                <input
                  type="text"
                  placeholder="利用者名など（任意）"
                  value={tplRehabName}
                  onChange={(e) => setTplRehabName(e.target.value)}
                  style={{
                    width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10,
                    border: "1px solid #E8E4DC", marginBottom: 12, fontSize: 14, fontFamily: "inherit", background: "#FBFAF7",
                  }}
                />

                <div className="tag-grid">
                  <button
                    className="tag-btn"
                    onClick={() => { addTemplateItem("rehab40", 40, tplRehabName); setTplRehabName(""); }}
                  >
                    リハビリ<br />40分
                  </button>
                  <button
                    className="tag-btn"
                    onClick={() => { addTemplateItem("rehab60", 60, tplRehabName); setTplRehabName(""); }}
                  >
                    リハビリ<br />60分
                  </button>
                  <button className="tag-btn other" onClick={() => setTplOtherOpen((v) => !v)}>
                    <Users size={16} style={{ display: "inline", marginRight: 6, verticalAlign: -3 }} />
                    その他（担当者会議など）
                  </button>
                </div>

                {tplOtherOpen && (
                  <div className="other-form">
                    <input
                      type="number"
                      placeholder="分数を入力（例：45）"
                      value={tplOtherMinutes}
                      onChange={(e) => setTplOtherMinutes(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="内容メモ（担当者会議 など・任意）"
                      value={tplOtherMemo}
                      onChange={(e) => setTplOtherMemo(e.target.value)}
                    />
                    <button
                      className="add-btn"
                      onClick={() => {
                        if (!tplOtherMinutes || Number(tplOtherMinutes) <= 0) return;
                        addTemplateItem("other", Number(tplOtherMinutes), tplOtherMemo);
                        setTplOtherMinutes("");
                        setTplOtherMemo("");
                        setTplOtherOpen(false);
                      }}
                    >
                      <Plus size={16} /> テンプレートに追加
                    </button>
                  </div>
                )}
              </div>

              <div className="card">
                <div className="muted" style={{ marginBottom: 4 }}>{year}年{month + 1}月に反映</div>
                <div className="date-row" style={{ marginTop: 10 }}>
                  <span className="muted">反映開始日（過去日もOK）</span>
                  <input
                    type="date"
                    value={applyFromDate}
                    onChange={(e) => setApplyFromDate(e.target.value)}
                  />
                </div>
                <button className="apply-btn" onClick={applyTemplateToMonth}>
                  <CalendarClock size={18} />この日以降の平日に予定を反映する
                </button>
                {applyMessage && <div className="apply-msg">{applyMessage}</div>}
                <div className="apply-note">
                  反映開始日以降で、まだ記録がない平日にだけその曜日の予定が追加されます。過去に遡って反映することもできます。
                  ただし、反映されるのはあくまで「予定」です。実績として確定するには、
                  必ず「入力」タブでその日を開き、内容を確認して登録ボタンを押してください。
                  自動的に実績へ反映されることはありません。
                  すでに実績や予定が入っている日は上書きされません。
                  キャンセルになった日は「入力」または「履歴」タブからその記録を削除、
                  予定外の訪問があれば「入力」タブから追加してください。
                </div>
              </div>
            </>
          )}

          {tab === "settings" && (
            <div className="card">
              <div className="muted" style={{ marginBottom: 14 }}>インセンティブの発生条件を設定します</div>

              <label className="settings-label">発生開始時間（時間）</label>
              <div className="settings-row">
                <input
                  type="number"
                  min="1"
                  value={thresholdHours}
                  onChange={(e) => setThresholdHours(e.target.value === "" ? "" : Number(e.target.value))}
                  onBlur={() => persistSettings(Number(thresholdHours) || DEFAULT_THRESHOLD_HOURS, Number(ratePerUnit) || DEFAULT_RATE_PER_UNIT)}
                />
                <span className="settings-unit">時間目から発生</span>
              </div>

              <label className="settings-label" style={{ marginTop: 18 }}>単価（60分あたり）</label>
              <div className="settings-row">
                <span className="settings-unit">¥</span>
                <input
                  type="number"
                  min="0"
                  value={ratePerUnit}
                  onChange={(e) => setRatePerUnit(e.target.value === "" ? "" : Number(e.target.value))}
                  onBlur={() => persistSettings(Number(thresholdHours) || DEFAULT_THRESHOLD_HOURS, Number(ratePerUnit) || DEFAULT_RATE_PER_UNIT)}
                />
                <span className="settings-unit">円 / 60分</span>
              </div>

              <div className="settings-preview">
                現在の設定：月{thresholdHours || DEFAULT_THRESHOLD_HOURS}時間を超えたら、{Number(thresholdHours || DEFAULT_THRESHOLD_HOURS) + 1}時間目から60分あたり{Number(ratePerUnit || DEFAULT_RATE_PER_UNIT).toLocaleString()}円を支給
              </div>

              <div className="apply-note" style={{ marginTop: 16 }}>
                入力欄から離れる（キーボードを閉じる）と自動的に保存されます。
                この設定は進捗・履歴タブのインセンティブ計算すべてに反映されます。
              </div>
            </div>
          )}
        </div>

        <div className="tab-bar">
          <div className="tab-bar-inner">
            <button className={`tab-btn ${tab === "input" ? "active" : ""}`} onClick={() => setTab("input")}>
              <Plus size={20} />入力
            </button>
            <button className={`tab-btn ${tab === "template" ? "active" : ""}`} onClick={() => setTab("template")}>
              <CalendarClock size={20} />予定
            </button>
            <button className={`tab-btn ${tab === "progress" ? "active" : ""}`} onClick={() => setTab("progress")}>
              <Gauge size={20} />進捗
            </button>
            <button className={`tab-btn ${tab === "history" ? "active" : ""}`} onClick={() => setTab("history")}>
              <History size={20} />履歴
            </button>
            <button className={`tab-btn ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>
              <Settings size={20} />設定
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
