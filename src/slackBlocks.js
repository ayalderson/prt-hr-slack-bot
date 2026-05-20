/**
 * Slack Block Kit UI Components
 * محسن — PRt HR Bot — Leave Tracking + FAQ
 */

// ─── Home Tab ─────────────────────────────────────────────────────────────────

const ADMIN_USER_IDS = ['U0AGAJMUJUF', 'U08USTV37L7', 'U0904KEN1LZ', 'U0ADZM93SV6'];

function buildHomeTab(userName, userId) {
  const isAdmin = ADMIN_USER_IDS.includes(userId);
  return {
    type: 'home',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'PRt | مساعد شؤون الموظفين', emoji: true }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `مرحباً *${userName}* :grin:\nآني اسمي محسن، بوت الاجازات واسئلة الموظفين هنا`
        }
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: ':black_medium_small_square: *شلون اقدر اساعدك؟*' }
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '📅 رصيد إجازاتي', emoji: true },
            action_id: 'check_my_balance',
            style: 'primary'
          },
          // {
          //   type: 'button',
          //   text: { type: 'plain_text', text: '✍️ طلب إجازة', emoji: true },
          //   action_id: 'request_leave'
          // },
          ...(isAdmin ? [{
            type: 'button',
            text: { type: 'plain_text', text: '📊 نظرة عامة على الفريق', emoji: true },
            action_id: 'team_overview'
          }] : [])
        ]
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '❓ أسئلة مكررة FAQ', emoji: true },
            action_id: 'view_faqs'
          }
        ]
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: ':black_medium_small_square: PRt — Public Relations & Communications'
          }
        ]
      }
    ]
  };
}

// ─── FAQ Question Picker Modal ────────────────────────────────────────────────

function buildFAQPickerModal(faqs) {
  const options = faqs.map((faq, i) => ({
    text: { type: 'plain_text', text: faq.question.substring(0, 75), emoji: true },
    value: String(i)
  }));

  return {
    type: 'modal',
    callback_id: 'faq_selected',
    title: { type: 'plain_text', text: 'أسئلة السياسات', emoji: true },
    submit: { type: 'plain_text', text: 'عرض الإجابة', emoji: true },
    close: { type: 'plain_text', text: 'إلغاء', emoji: true },
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: '*اختر سؤالاً لعرض الإجابة:*' }
      },
      {
        type: 'input',
        block_id: 'faq_pick',
        label: { type: 'plain_text', text: 'السؤال', emoji: true },
        element: {
          type: 'static_select',
          action_id: 'faq_option',
          placeholder: { type: 'plain_text', text: 'اختر سؤالاً...' },
          options
        }
      }
    ]
  };
}

// ─── Leave Balance ────────────────────────────────────────────────────────────

function buildLeaveBalanceBlocks(summary) {
  if (!summary) {
    return [{
      type: 'section',
      text: { type: 'mrkdwn', text: '❌ لا توجد سجلات إجازات لهذا الموظف.' }
    }];
  }

  const remaining = summary.remaining;
  const remainingEmoji = remaining >= 15 ? '🟢' : remaining >= 7 ? '🟡' : '🔴';
  const used = 21 - remaining;
  const filled = Math.round((used / 21) * 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `◾ ملخص الإجازات — ${summary.name}`, emoji: true }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `${remainingEmoji} *الإجازات السنوية المتبقية*\n${remaining} من 21 يوم` },
        { type: 'mrkdwn', text: `📅 *أيام الإجازة المستخدمة*\n${summary.annualDeductibleUsed} يوم` },
        { type: 'mrkdwn', text: `🏠 *أيام العمل من المنزل هذا الشهر (WFH)*\n${summary.wfhUsedCurrentMonth} يوم ${summary.wfhUsedCurrentMonth > 2 ? '⚠️' : ''}` },
        { type: 'mrkdwn', text: `🤒 *الإجازات المرضية*\n${summary.sickUsed} يوم` }
      ]
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*المستخدم:* \`${bar}\` ${used}/21` }
    }
  ];

  if (summary.records.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*◾ السجلات الأخيرة:*' }
    });
    summary.records.slice(-5).reverse().forEach(r => {
      const emoji = getLeaveTypeEmoji(r.type);
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${r.type}* — ${r.startDate}${r.days > 1 ? ` → ${r.endDate}` : ''} _(${r.days}d)_${r.notes ? `\n_${r.notes}_` : ''}`
        }
      });
    });
  }

  return blocks;
}

// ─── Leave Request Modal ──────────────────────────────────────────────────────

function buildLeaveRequestModal() {
  return {
    type: 'modal',
    callback_id: 'submit_leave_request',
    title: { type: 'plain_text', text: 'طلب إجازة', emoji: true },
    submit: { type: 'plain_text', text: 'إرسال', emoji: true },
    close: { type: 'plain_text', text: 'إلغاء', emoji: true },
    blocks: [
      {
        type: 'input',
        block_id: 'employee_name',
        label: { type: 'plain_text', text: 'الاسم الكامل', emoji: true },
        element: {
          type: 'plain_text_input',
          action_id: 'name_input',
          placeholder: { type: 'plain_text', text: 'مثال: أحمد علي' }
        }
      },
      {
        type: 'input',
        block_id: 'leave_type',
        label: { type: 'plain_text', text: 'نوع الإجازة', emoji: true },
        element: {
          type: 'static_select',
          action_id: 'type_select',
          placeholder: { type: 'plain_text', text: 'اختر نوع الإجازة' },
          options: [
            { text: { type: 'plain_text', text: '📅 إجازة سنوية' }, value: 'Holiday' },
            { text: { type: 'plain_text', text: '🤒 إجازة مرضية' }, value: 'Sick' },
            { text: { type: 'plain_text', text: '🏠 عمل من المنزل' }, value: 'WFH' },
            { text: { type: 'plain_text', text: '👶 إجازة أمومة / أبوة' }, value: 'Maternity/Paternity' },
            { text: { type: 'plain_text', text: '🕊️ إجازة عزاء' }, value: 'Compassionate' },
            { text: { type: 'plain_text', text: '💍 إجازة زواج' }, value: 'Marriage' },
            { text: { type: 'plain_text', text: '🔄 تعويض عطلة نهاية الأسبوع' }, value: 'Weekend Comp' },
            { text: { type: 'plain_text', text: '⏰ نصف يوم' }, value: 'Half-Day' },
            { text: { type: 'plain_text', text: '⛔ إجازة بدون راتب' }, value: 'Unpaid' }
          ]
        }
      },
      {
        type: 'input',
        block_id: 'start_date',
        label: { type: 'plain_text', text: 'تاريخ البداية', emoji: true },
        element: { type: 'datepicker', action_id: 'start_date_pick' }
      },
      {
        type: 'input',
        block_id: 'end_date',
        label: { type: 'plain_text', text: 'تاريخ النهاية', emoji: true },
        element: { type: 'datepicker', action_id: 'end_date_pick' }
      },
      {
        type: 'input',
        block_id: 'reason',
        optional: true,
        label: { type: 'plain_text', text: 'السبب (اختياري)', emoji: true },
        element: {
          type: 'plain_text_input',
          action_id: 'reason_input',
          multiline: true
        }
      },
      {
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: '⚠️ يجب أيضاً إرسال بريد إلكتروني لمديرك مع نسخة إلى: a.alaa@prt.iq, a.ali@prt.iq, aya.mohammed@prt.iq'
        }]
      }
    ]
  };
}

// ─── Leave Request Confirmation ───────────────────────────────────────────────

function buildLeaveConfirmationBlocks(request, interpretation) {
  const statusText = interpretation.compliant ? 'تدلل ✅' : 'إجراء مطلوب ⚠️';

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `طلب إجازة - ${statusText}`, emoji: true }
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*الموظف:*\n${request.employee}` },
        { type: 'mrkdwn', text: `*النوع:*\n${getLeaveTypeEmoji(request.type)} ${request.type}` },
        { type: 'mrkdwn', text: `*من:*\n${request.startDate}` },
        { type: 'mrkdwn', text: `*إلى:*\n${request.endDate}` },
        { type: 'mrkdwn', text: `*المدة:*\n${request.days} يوم` }
      ]
    }
  ];

  if (interpretation.issues && interpretation.issues.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `⚠️ *مخالفات السياسة:*\n${interpretation.issues.map(i => `• ${i}`).join('\n')}` }
    });
  }

  if (interpretation.requirements && interpretation.requirements.length > 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `:black_medium_small_square: *إجراءات مطلوبة:*\n${interpretation.requirements.map(r => `• ${r}`).join('\n')}` }
    });
  }

  if (interpretation.guidance) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `_${interpretation.guidance}_` }
    });
  }

  return blocks;
}

// ─── Team Overview ────────────────────────────────────────────────────────────

function buildTeamOverviewBlocks(monthData, month) {
  if (monthData.error) {
    return [{ type: 'section', text: { type: 'mrkdwn', text: `❌ ${monthData.error}` } }];
  }

  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `◾ إجازات الفريق — ${month}`, emoji: true }
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${monthData.totalRecords} سجل* مسجل لشهر ${month}` }
    },
    { type: 'divider' }
  ];

  const byType = {};
  for (const r of monthData.records) {
    const type = r.type || 'Unknown';
    if (!byType[type]) byType[type] = [];
    byType[type].push(r);
  }

  for (const [type, records] of Object.entries(byType)) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${getLeaveTypeEmoji(type)} *${type}* (${records.length}): ${records.map(r => r.name).join(', ')}`
      }
    });
  }

  return blocks;
}

// ─── FAQ Blocks ───────────────────────────────────────────────────────────────

function buildFAQBlocks(question, answer) {
  return [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*❓ ${question}*` }
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: answer }
    },
  ];
}

function buildAllFAQsBlocks(faqs) {
  if (!faqs || faqs.length === 0) {
    return [{ type: 'section', text: { type: 'mrkdwn', text: '❌ لا توجد أسئلة شائعة.' } }];
  }

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '◾ الأسئلة الشائعة', emoji: true } },
    { type: 'divider' }
  ];

  faqs.forEach((faq, i) => {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${i + 1}. ${faq.question}*\n${faq.answer}` }
    });
    blocks.push({ type: 'divider' });
  });

  return blocks;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLeaveTypeEmoji(type) {
  const map = {
    'Holiday': '📅', 'Sick': '🤒', 'WFH': '🏠',
    'Maternity/Paternity': '👶', 'Compassionate': '🕊️',
    'Marriage': '💍', 'Weekend Comp': '🔄',
    'Half-Day': '⏰', 'Unpaid': '⛔', 'Absent': '❌'
  };
  return map[type] || '📋';
}

module.exports = {
  buildHomeTab,
  buildFAQPickerModal,
  buildLeaveBalanceBlocks,
  buildLeaveRequestModal,
  buildLeaveConfirmationBlocks,
  buildTeamOverviewBlocks,
  buildFAQBlocks,
  buildAllFAQsBlocks,
  getLeaveTypeEmoji
};