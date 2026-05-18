/**
 * محسن — PRt Agency Slack Bot
 * Leave Tracking (Google Sheets) + FAQ (Airtable dropdown)
 * No AI API required.
 */

require('dotenv').config();

const { App } = require('@slack/bolt');
const {
  getEmployeeSummary,
  getMonthOverview,
  getAvailableMonths,
  getWFHViolations
} = require('./leaveService');
const { resolveEmployeeName } = require('./nameResolver');
const { getAllEmployeeNames } = require('./leaveService');
const { findAnswer, getAllFAQs } = require('./faqService');
const {
  buildHomeTab,
  buildFAQPickerModal,
  buildLeaveBalanceBlocks,
  buildLeaveRequestModal,
  buildTeamOverviewBlocks,
  buildLeaveConfirmationBlocks,
  buildFAQBlocks,
  buildAllFAQsBlocks
} = require('./slackBlocks');

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true
});

// ─── App Home ─────────────────────────────────────────────────────────────────

app.event('app_home_opened', async ({ event, client }) => {
  try {
    const userInfo = await client.users.info({ user: event.user });
    const userName = userInfo.user?.real_name || userInfo.user?.name || 'there';
    await client.views.publish({
      user_id: event.user,
      view: buildHomeTab(userName, event.user)
    });
  } catch (err) {
    console.error('Home tab error:', err.message);
  }
});

// ─── Leave Balance ────────────────────────────────────────────────────────────

app.action('check_my_balance', async ({ body, client, ack }) => {
  await ack();
  const userId = body.user.id;

  // Auto-detect from Slack profile
  const resolved = await resolveEmployeeName(client, userId, getAllEmployeeNames).catch(() => null);

  if (resolved && resolved.matchedName) {
    // Found a match — show balance directly, no typing needed
    const summary = await getEmployeeSummary(resolved.matchedName).catch(() => null);
    const note = resolved.confidence === 'partial'
      ? `_Matched "${resolved.slackName}" → "${resolved.matchedName}". Not you? Use /leave-balance [name]_\n\n`
      : '';
    await client.chat.postMessage({
      channel: userId,
      text: `📋 Leave summary for ${resolved.matchedName}`,
      blocks: [
        ...(note ? [{ type: 'section', text: { type: 'mrkdwn', text: note } }] : []),
        ...buildLeaveBalanceBlocks(summary)
      ]
    });
  } else {
    // Could not auto-match — fall back to name input modal
    const hint = resolved?.slackName
      ? `Could not match your Slack name "${resolved.slackName}" to a record. Please type your name as it appears in the leave sheet.`
      : 'Please enter your name as it appears in the leave sheet.';

    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'lookup_balance',
        title: { type: 'plain_text', text: 'رصيد الإجازات' },
        submit: { type: 'plain_text', text: 'بحث' },
        close: { type: 'plain_text', text: 'إلغاء' },
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `ℹ️ ${hint}` }
          },
          {
            type: 'input',
            block_id: 'emp_name',
            label: { type: 'plain_text', text: 'اسم الموظف' },
            element: {
              type: 'plain_text_input',
              action_id: 'name_input',
              placeholder: { type: 'plain_text', text: 'مثال: أحمد علي' }
            }
          }
        ]
      }
    });
  }
});

app.view('lookup_balance', async ({ ack, body, view, client }) => {
  await ack();
  const name = view.state.values.emp_name.name_input.value;
  const userId = body.user.id;
  const summary = await getEmployeeSummary(name).catch(() => null);
  await client.chat.postMessage({
    channel: userId,
    text: summary ? `📋 Leave summary for ${summary.name}` : `❌ No records found for "${name}". Check spelling matches the leave sheet.`,
    blocks: buildLeaveBalanceBlocks(summary)
  });
});

// ─── Leave Request ────────────────────────────────────────────────────────────

app.action('request_leave', async ({ body, client, ack }) => {
  await ack();
  await client.views.open({ trigger_id: body.trigger_id, view: buildLeaveRequestModal() });
});

app.view('submit_leave_request', async ({ ack, body, view, client }) => {
  await ack();
  const values = view.state.values;
  const userId = body.user.id;
  const startDate = values.start_date.start_date_pick.selected_date;
  const endDate = values.end_date.end_date_pick.selected_date;
  const type = values.leave_type.type_select.selected_option?.value;
  const employee = values.employee_name.name_input.value;
  const reason = values.reason?.reason_input?.value || '';

  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1);
  const noticeDays = Math.round((start - new Date()) / (1000 * 60 * 60 * 24));

  const issues = [];
  const requirements = [];

  if (type === 'Holiday' && noticeDays < days) {
    issues.push(`Notice too short — ${days}-day leave needs ${days} days notice, you gave ${noticeDays}.`);
  }
  if (type === 'Holiday' && days > 10) {
    issues.push('Annual leave cannot exceed 10 consecutive days.');
  }
  if (type === 'WFH' && days > 2) {
    issues.push('WFH cannot exceed 2 days per month.');
  }
  if (type === 'Sick' && days >= 3) {
    requirements.push('Medical certificate required from day 3 onward.');
  }
  if (type === 'Sick' && days >= 14) {
    requirements.push('Sick leave of 2+ weeks requires management approval.');
  }
  requirements.push('Email your manager and CC: a.alaa@prt.iq, a.ali@prt.iq, aya.mohammed@prt.iq');

  const interpretation = {
    compliant: issues.length === 0,
    issues,
    requirements,
    guidance: issues.length === 0
      ? null
      : `Please review the issues above before submitting.`
  };

  await client.chat.postMessage({
    channel: userId,
    text: `Leave request for ${employee}`,
    blocks: buildLeaveConfirmationBlocks({ employee, type, startDate, endDate, days, reason }, interpretation)
  });
});

// ─── Team Overview ────────────────────────────────────────────────────────────

const ADMIN_USER_IDS = ['U0AGAJMUJUF', 'U08USTV37L7', 'U0904KEN1LZ', 'U0ADZM93SV6'];

app.action('team_overview', async ({ body, client, ack }) => {
  await ack();
  if (!ADMIN_USER_IDS.includes(body.user.id)) return;
  const months = getAvailableMonths();
  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'view_team_overview',
      title: { type: 'plain_text', text: 'نظرة عامة على الفريق' },
      submit: { type: 'plain_text', text: 'عرض' },
      close: { type: 'plain_text', text: 'إلغاء' },
      blocks: [
        {
          type: 'input',
          block_id: 'month_select',
          label: { type: 'plain_text', text: 'اختر الشهر' },
          element: {
            type: 'static_select',
            action_id: 'month_option',
            options: months.map(m => ({ text: { type: 'plain_text', text: m }, value: m }))
          }
        }
      ]
    }
  });
});

app.view('view_team_overview', async ({ ack, body, view, client }) => {
  await ack();
  const month = view.state.values.month_select.month_option.selected_option?.value;
  const userId = body.user.id;
  const monthData = await getMonthOverview(month).catch(e => ({ error: e.message }));
  await client.chat.postMessage({
    channel: userId,
    text: `📊 Team leave for ${month}`,
    blocks: buildTeamOverviewBlocks(monthData, month)
  });
});

// ─── FAQ — Browse (dropdown picker) ──────────────────────────────────────────

app.action('browse_faqs', async ({ body, client, ack }) => {
  await ack();
  try {
    const faqs = await getAllFAQs();
    if (!faqs || faqs.length === 0) {
      await client.chat.postMessage({
        channel: body.user.id,
        text: '❌ No FAQs found in Airtable. Please add some records first.'
      });
      return;
    }
    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildFAQPickerModal(faqs)
    });
  } catch (e) {
    console.error('browse_faqs error:', e.message);
  }
});

// Store FAQs temporarily between modal open and submit (keyed by user)
const faqCache = {};

app.action('browse_faqs', async ({ body, client, ack }) => {
  await ack();
  try {
    const faqs = await getAllFAQs();
    faqCache[body.user.id] = faqs; // cache for submission
    await client.views.open({
      trigger_id: body.trigger_id,
      view: buildFAQPickerModal(faqs)
    });
  } catch (e) {
    console.error('FAQ picker error:', e.message);
  }
});

app.view('faq_selected', async ({ ack, body, view, client }) => {
  await ack();
  const userId = body.user.id;
  const selectedIndex = parseInt(view.state.values.faq_pick.faq_option.selected_option?.value);
  const faqs = faqCache[userId] || await getAllFAQs();
  const faq = faqs[selectedIndex];

  if (!faq) {
    await client.chat.postMessage({ channel: userId, text: '❌ Could not find that answer. Try again.' });
    return;
  }

  await client.chat.postMessage({
    channel: userId,
    text: faq.question,
    blocks: buildFAQBlocks(faq.question, faq.answer)
  });
});

// ─── FAQ — View All ───────────────────────────────────────────────────────────

app.action('view_faqs', async ({ body, client, ack }) => {
  await ack();
  try {
    const faqs = await getAllFAQs();
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        title: { type: 'plain_text', text: 'الأسئلة الشائعة' },
        close: { type: 'plain_text', text: 'إغلاق' },
        blocks: buildAllFAQsBlocks(faqs)
      }
    });
  } catch (e) {
    console.error('view_faqs error:', e.message);
  }
});

// ─── DMs & Mentions ───────────────────────────────────────────────────────────

async function handleMessage(text, say, threadTs = null) {
  const replyOpts = threadTs ? { thread_ts: threadTs } : {};

  // balance [name] shortcut
  const balanceMatch = text.match(/^balance\s+(.+)/i) || text.match(/^رصيد\s+(.+)/i);
  if (balanceMatch) {
    const summary = await getEmployeeSummary(balanceMatch[1].trim()).catch(() => null);
    await say({ ...replyOpts, text: 'Leave balance', blocks: buildLeaveBalanceBlocks(summary) });
    return;
  }

  // FAQ keyword search
  const match = await findAnswer(text).catch(() => null);
  if (match) {
    await say({ ...replyOpts, blocks: buildFAQBlocks(match.question, match.answer) });
  } else {
    await say({
      ...replyOpts,
      blocks: [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `🤷 لم أتمكن من إيجاد إجابة لسؤالك.\n\nجرّب السؤال عن:\n• ساعات العمل\n• الإجازات المرضية\n• سياسة العمل من المنزل\n• الإجازة السنوية\n• الاستقالة\n• موعد الراتب`
        }
      }]
    });
  }
}

app.message(async ({ message, say }) => {
  if (message.bot_id || !message.text) return;
  await handleMessage(message.text.trim(), say);
});

app.event('app_mention', async ({ event, say }) => {
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  if (!text) {
    await say({ thread_ts: event.ts, text: 'مرحباً! أرسل لي رسالة مباشرة أو استخدم تبويب التطبيق الرئيسي.' });
    return;
  }
  await handleMessage(text, say, event.ts);
});

// ─── Slash Commands ───────────────────────────────────────────────────────────

app.command('/leave-balance', async ({ command, ack, respond, client }) => {
  await ack();
  let name = command.text.trim();

  // If no name given, try to auto-detect from Slack profile
  if (!name) {
    const resolved = await resolveEmployeeName(client, command.user_id, getAllEmployeeNames).catch(() => null);
    if (resolved?.matchedName) {
      name = resolved.matchedName;
    } else {
      await respond('❌ Could not detect your name. Usage: `/leave-balance Aya Mohammed`');
      return;
    }
  }

  const summary = await getEmployeeSummary(name).catch(() => null);
  await respond({ response_type: 'ephemeral', text: `Leave balance for ${name}`, blocks: buildLeaveBalanceBlocks(summary) });
});

app.command('/faq', async ({ command, ack, respond }) => {
  await ack();
  const query = command.text.trim();
  if (!query) {
    const faqs = await getAllFAQs().catch(() => []);
    await respond({ response_type: 'ephemeral', blocks: buildAllFAQsBlocks(faqs) });
    return;
  }
  const match = await findAnswer(query).catch(() => null);
  if (match) {
    await respond({ response_type: 'ephemeral', blocks: buildFAQBlocks(match.question, match.answer) });
  } else {
    await respond({ response_type: 'ephemeral', text: '🤷 No match found. Try `/faq` to see all questions.' });
  }
});

app.command('/wfh-violations', async ({ command, ack, respond }) => {
  await ack();
  const violations = await getWFHViolations().catch(() => []);
  if (violations.length === 0) {
    await respond({ response_type: 'ephemeral', text: '✅ No WFH violations found.' });
    return;
  }
  const lines = violations.map(v => `⚠️ *${v.name}* — ${v.wfhDays} WFH days in ${v.month}`);
  await respond({
    response_type: 'ephemeral',
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: `*⚠️ WFH Violations (${violations.length})*\n\n${lines.join('\n')}` } }]
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

(async () => {
  await app.start();
  console.log('');
  console.log('✅ محسن — PRt HR Bot is running!');
  console.log('   Leave data : Google Sheets (live CSV)');
  console.log('   FAQ        : Airtable (dropdown picker)');
  console.log('   No AI API  : ✓');
  console.log('');
})();