// 订阅管家 for Scriptable v1.0
// ================================
// 安装方法：
// 1. App Store 下载免费 App「Scriptable」
// 2. 打开 Scriptable → 右上角「+」新建脚本
// 3. 贴上此全部代码
// 4. 点右上角「▶」运行
// 5. 允许通知权限
// ================================

const fm = FileManager.iCloud();
const DATA_FILE = fm.joinPath(fm.documentsDirectory(), 'subscription_manager.json');

// ─── 数据读写 ─────────────────────────────────────────────────
async function loadSubs() {
  try {
    if (fm.fileExists(DATA_FILE)) {
      await fm.downloadFileFromiCloud(DATA_FILE);
      return JSON.parse(fm.readString(DATA_FILE));
    }
  } catch(e) {}
  return [];
}

function saveSubs(data) {
  fm.writeString(DATA_FILE, JSON.stringify(data, null, 2));
}

// ─── 日期工具 ─────────────────────────────────────────────────
function getNextRenewal(startDate) {
  const start = new Date(startDate);
  const day = start.getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), today.getMonth(), day);
  if (next < today) next = new Date(today.getFullYear(), today.getMonth() + 1, day);
  return next;
}

function getDaysUntil(date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / 86400000);
}

function formatDate(d) {
  return `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
}

function getMonths(startDate) {
  const s = new Date(startDate), t = new Date();
  return Math.max(0, (t.getFullYear()-s.getFullYear())*12 + t.getMonth()-s.getMonth());
}

// ─── 通知排程 ─────────────────────────────────────────────────
async function scheduleNotifications(subs) {
  await Notification.removeAllPending();
  let count = 0;
  for (const s of subs) {
    const renewal = getNextRenewal(s.startDate);
    const notifTime = new Date(renewal);
    notifTime.setDate(notifTime.getDate() - 1);
    notifTime.setHours(9, 0, 0, 0); // 到期前一天早上 9:00
    if (notifTime > new Date()) {
      const n = new Notification();
      n.identifier = `sub_${s.id}_${renewal.getTime()}`;
      n.title = `${s.icon || '📺'} ${s.name} 明天续费`;
      n.body = `${s.fee} ${s.currency} 将在明天（${formatDate(renewal)}）扣除，请确认余额`;
      n.scheduledDate = notifTime;
      n.sound = 'default';
      await n.schedule();
      count++;
    }
  }
  return count;
}

// ─── 主菜单 ───────────────────────────────────────────────────
async function showMain(subs) {
  const a = new Alert();
  a.title = '📺 订阅管家';

  if (subs.length === 0) {
    a.message = '还没有订阅\n点「添加订阅」开始使用';
  } else {
    // 计算月费合计
    const totals = {};
    for (const s of subs) totals[s.currency] = (totals[s.currency] || 0) + parseFloat(s.fee);
    const totalStr = Object.entries(totals).map(([c,v]) => `${v.toFixed(2)} ${c}`).join(' | ');

    // 按到期日排序
    const sorted = [...subs].sort((a,b) =>
      getDaysUntil(getNextRenewal(a.startDate)) - getDaysUntil(getNextRenewal(b.startDate))
    );

    const lines = sorted.map(s => {
      const days = getDaysUntil(getNextRenewal(s.startDate));
      const badge = days === 0 ? '🔴 今天到期' :
                    days === 1 ? '🔴 明天到期' :
                    days <= 7  ? `🟡 ${days}天后` :
                                 `🟢 ${days}天后`;
      return `${s.icon || '📦'} ${s.name}  ${s.fee} ${s.currency}  ${badge}`;
    });

    a.message = `月费合计：${totalStr}\n${'─'.repeat(28)}\n${lines.join('\n')}`;
  }

  a.addAction('➕ 添加订阅');
  if (subs.length > 0) {
    a.addAction('✏️ 查看 / 编辑 / 删除');
    a.addAction('🔔 更新到期提醒');
  }
  a.addCancelAction('关闭');
  return await a.presentSheet();
}

// ─── 添加订阅（三步表单）─────────────────────────────────────
async function addSubForm() {
  // 第 1 步：名称 + 图标
  const a1 = new Alert();
  a1.title = '➕ 添加订阅（1/3）';
  a1.message = '服务名称和图标';
  a1.addTextField('服务名称（例：Netflix）', '');
  a1.addTextField('图标 Emoji（例：🎬）', '');
  a1.addAction('下一步 →');
  a1.addCancelAction('取消');
  if (await a1.present() === -1) return null;
  const name = a1.textFieldValue(0).trim();
  const icon = a1.textFieldValue(1).trim() || '📦';
  if (!name) { await showMsg('提示', '请输入服务名称'); return null; }

  // 第 2 步：月费 + 货币
  const a2 = new Alert();
  a2.title = '➕ 添加订阅（2/3）';
  a2.message = '每月费用';
  a2.addTextField('金额（例：68）', '');
  a2.addTextField('货币（CNY / USD / HKD / TWD）', 'CNY');
  a2.addAction('下一步 →');
  a2.addCancelAction('取消');
  if (await a2.present() === -1) return null;
  const fee = parseFloat(a2.textFieldValue(0));
  const currency = a2.textFieldValue(1).trim().toUpperCase() || 'CNY';
  if (isNaN(fee) || fee <= 0) { await showMsg('提示', '请输入正确的金额'); return null; }

  // 第 3 步：订阅日期
  const today = new Date();
  const defaultDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const a3 = new Alert();
  a3.title = '➕ 添加订阅（3/3）';
  a3.message = '订阅开始日期（决定每月扣款日）\n格式：YYYY-MM-DD';
  a3.addTextField('例：2024-01-15', defaultDate);
  a3.addAction('✅ 完成');
  a3.addCancelAction('取消');
  if (await a3.present() === -1) return null;
  const startDate = a3.textFieldValue(0).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    await showMsg('日期格式错误', '请使用 YYYY-MM-DD 格式\n例：2024-01-15');
    return null;
  }

  return { id: Date.now().toString(), name, icon, fee, currency, startDate };
}

// ─── 查看 / 编辑 / 删除 ──────────────────────────────────────
async function editMenu(subs) {
  // 选择订阅
  const a = new Alert();
  a.title = '选择订阅';
  a.message = '点击查看详情或编辑';
  const sorted = [...subs].sort((a,b) =>
    getDaysUntil(getNextRenewal(a.startDate)) - getDaysUntil(getNextRenewal(b.startDate))
  );
  for (const s of sorted) {
    const days = getDaysUntil(getNextRenewal(s.startDate));
    a.addAction(`${s.icon || '📦'} ${s.name}  ${s.fee} ${s.currency}  (${days}天后)`);
  }
  a.addCancelAction('返回');
  const idx = await a.presentSheet();
  if (idx === -1) return;

  const sub = sorted[idx];
  const realIdx = subs.findIndex(s => s.id === sub.id);
  const renewal = getNextRenewal(sub.startDate);
  const months = getMonths(sub.startDate);
  const days = getDaysUntil(renewal);

  // 详情菜单
  const b = new Alert();
  b.title = `${sub.icon || '📦'} ${sub.name}`;
  b.message =
    `月费：${sub.fee} ${sub.currency}\n` +
    `订阅开始：${sub.startDate}\n` +
    `已订阅：${months} 个月\n` +
    `累计消费：${(months * sub.fee).toFixed(2)} ${sub.currency}\n` +
    `下次续费：${formatDate(renewal)}\n` +
    `距离续费：${days} 天`;
  b.addAction('✏️ 编辑');
  b.addDestructiveAction('🗑️ 删除');
  b.addCancelAction('返回');
  const action = await b.present();

  if (action === 0) {
    await editSubForm(subs, realIdx);
  } else if (action === 1) {
    const c = new Alert();
    c.title = '确认删除';
    c.message = `确定要删除「${sub.name}」吗？`;
    c.addDestructiveAction('确认删除');
    c.addCancelAction('取消');
    if (await c.present() === 0) {
      subs.splice(realIdx, 1);
      saveSubs(subs);
      await showMsg('✅ 已删除', `「${sub.name}」已删除`);
    }
  }
}

async function editSubForm(subs, idx) {
  const sub = subs[idx];

  const a1 = new Alert();
  a1.title = '✏️ 编辑（1/3）名称与图标';
  a1.addTextField('名称', sub.name);
  a1.addTextField('图标', sub.icon || '');
  a1.addAction('下一步 →');
  a1.addCancelAction('取消');
  if (await a1.present() === -1) return;

  const a2 = new Alert();
  a2.title = '✏️ 编辑（2/3）费用';
  a2.addTextField('月费', String(sub.fee));
  a2.addTextField('货币', sub.currency);
  a2.addAction('下一步 →');
  a2.addCancelAction('取消');
  if (await a2.present() === -1) return;

  const a3 = new Alert();
  a3.title = '✏️ 编辑（3/3）日期';
  a3.addTextField('订阅日期', sub.startDate);
  a3.addAction('💾 保存');
  a3.addCancelAction('取消');
  if (await a3.present() === -1) return;

  subs[idx] = {
    ...sub,
    name: a1.textFieldValue(0).trim() || sub.name,
    icon: a1.textFieldValue(1).trim() || sub.icon,
    fee: parseFloat(a2.textFieldValue(0)) || sub.fee,
    currency: a2.textFieldValue(1).trim().toUpperCase() || sub.currency,
    startDate: a3.textFieldValue(0).trim() || sub.startDate,
  };
  saveSubs(subs);
  await showMsg('✅ 已保存', `「${subs[idx].name}」已更新`);
}

// ─── 工具 ─────────────────────────────────────────────────────
async function showMsg(title, msg) {
  const a = new Alert();
  a.title = title;
  a.message = msg;
  a.addAction('好');
  await a.present();
}

// ─── 主程序 ───────────────────────────────────────────────────
async function run() {
  let subs = await loadSubs();

  while (true) {
    const choice = await showMain(subs);

    if (choice === 0) {
      // 添加
      const newSub = await addSubForm();
      if (newSub) {
        subs.push(newSub);
        saveSubs(subs);
        const count = await scheduleNotifications(subs);
        await showMsg('✅ 已添加', `「${newSub.name}」已添加\n已安排 ${count} 个到期提醒\n将在续费前一天早上 9:00 通知你`);
      }
    } else if (choice === 1) {
      // 编辑
      await editMenu(subs);
      subs = await loadSubs();
    } else if (choice === 2) {
      // 更新通知
      const count = await scheduleNotifications(subs);
      await showMsg('🔔 提醒已更新', `已安排 ${count} 个到期提醒\n将在续费前一天早上 9:00 通知你`);
    } else {
      break;
    }
  }
}

await run();
