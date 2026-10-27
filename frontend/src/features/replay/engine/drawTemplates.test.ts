import { fibLevelsOn, withDefaults, type Drawing } from "./drawings";
import { BUILTIN_TEMPLATES, builtinsChanged, deleteTemplate, listTemplates, restoreBuiltins, saveTemplate, templatePatch } from "./drawTemplates";

const fib = (extra: Partial<Drawing> = {}): Drawing => ({ id: 1, sym: "X", type: "fib", pts: [{ t: 0, p: 100 }, { t: 60, p: 200 }], ...extra });
const on = (d: Drawing) => fibLevelsOn(withDefaults(d)).map((l) => l.v);

beforeEach(() => localStorage.clear());

test("Fib comes with OTE, STD and FIBO; other tools start with none", () => {
  expect(listTemplates("fib").map((x) => x.name)).toEqual(["OTE", "STD", "FIBO"]);
  expect(listTemplates("trend")).toEqual([]);
});

test("the built-in templates have the ICT levels and keep all 24 level slots", () => {
  const [ote, std, fibo] = listTemplates("fib");
  const apply = (tpl: typeof ote) => ({ ...fib(), ...templatePatch(fib(), tpl) });
  expect(on(apply(ote))).toEqual([-1, -0.62, -0.27, 0, 0.5, 0.62, 0.705, 0.79, 1]);
  expect(on(apply(std))).toEqual([-4.5, -4, -2.5, -2, -1, 0, 1]);
  expect(on(apply(fibo))).toEqual([0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]);
  for (const tpl of [ote, std, fibo]) expect(tpl.style.fibLevels).toHaveLength(24);
});

test("saving keeps the drawing's style under a name, replaces a same-named one, and survives a reload", () => {
  saveTemplate(fib({ fibReverse: true, extR: true }), "My OTE");
  // trùng tên mẫu dựng sẵn: ghi đè ngay chỗ của nó, giữ đúng tên
  saveTemplate(fib({ fibLog: true }), "ote");
  const list = listTemplates("fib");
  expect(list.map((x) => x.name)).toEqual(["OTE", "STD", "FIBO", "My OTE"]);
  expect(list[0].style).toEqual({ fibLog: true });
  expect(list[3].style).toEqual({ fibReverse: true, extR: true });
  expect(deleteTemplate("fib", "std").map((x) => x.name)).toEqual(["OTE", "FIBO", "My OTE"]);
  expect(listTemplates("fib").map((x) => x.name)).toEqual(["OTE", "FIBO", "My OTE"]);
});

test("built-in templates can be restored, and the browser never keeps a copy of an untouched one", () => {
  expect(builtinsChanged("fib")).toBe(false);
  saveTemplate(fib({ fibLog: true }), "OTE");
  deleteTemplate("fib", "FIBO");
  saveTemplate(fib({ fibReverse: true }), "Mine");
  expect(builtinsChanged("fib")).toBe(true);
  // chỉ phần của người dùng nằm trong trình duyệt: sửa STD trong code thì người dùng vẫn nhận được
  const stored = JSON.parse(localStorage.getItem("journal.replay.drawTemplates.v2.fib")!);
  expect(stored).toEqual({ user: [{ name: "OTE", style: { fibLog: true } }, { name: "Mine", style: { fibReverse: true } }], removed: ["FIBO"] });

  const back = restoreBuiltins("fib");
  expect(back.map((x) => x.name)).toEqual(["OTE", "STD", "FIBO", "Mine"]);
  expect(back[0]).toEqual(BUILTIN_TEMPLATES.fib![0]);
  expect(builtinsChanged("fib")).toBe(false);
});

test("applying a template (or the default) clears styles the template doesn't set", () => {
  const d = fib({ fibReverse: true, fibBg: false, color: "red", name: "keep me" });
  const tpl = { name: "x", style: { fibLog: true } };
  const next = { ...d, ...templatePatch(d, tpl) };
  expect(withDefaults(next)).toMatchObject({ fibLog: true, fibBg: true, color: "var(--replay-fib-0)", name: "keep me" });
  expect(withDefaults(next).fibReverse).toBeUndefined();
  const reset = withDefaults({ ...d, ...templatePatch(d, null) });
  expect(reset.fibBg).toBe(true);
  expect(reset.fibReverse).toBeUndefined();
  // áp xong sửa tiếp không làm hỏng mẫu đã lưu
  (next.fibLevels as unknown) = undefined;
  expect(tpl.style).toEqual({ fibLog: true });
});
