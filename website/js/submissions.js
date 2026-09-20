// Netto frontend module.
// Loaded as a classic script so the existing shared global scope stays intact.

// ===== VRAAG INSTUREN — eigen vraag óf puzzel opsturen voor review =====
  let submitMode = 'vraag';

  function openSubmitQuestion() {
    closeMenu();
    // Voorkom dat een gast eerst een heel formulier invult voordat inloggen nodig blijkt.
    if (!currentUser) { openAuthModal(); return; }
    showScreen('submit');
    document.getElementById('submitScreen').classList.add('active');
    switchSubmitMode(submitMode);
    const un = document.getElementById('subUsername');
    if (un && currentUser) un.placeholder = currentUser.username || 'bijv. Berend';
    updateSubmitPreview();
    checkSubmissionNotifications();
  }

  function closeSubmitQuestion() {
    document.getElementById('submitScreen').classList.remove('active');
    showScreen('home');
  }

  function switchSubmitMode(mode) {
    submitMode = mode === 'puzzel' ? 'puzzel' : 'vraag';
    const isPuzzel = submitMode === 'puzzel';
    document.getElementById('submitTabVraag').classList.toggle('is-active', !isPuzzel);
    document.getElementById('submitTabPuzzel').classList.toggle('is-active', isPuzzel);
    document.querySelectorAll('#submitPuzzelGrid [data-puzzel-only]').forEach(el => { el.style.display = isPuzzel ? '' : 'none'; });
    document.getElementById('submitPuzzelExtra').style.display = isPuzzel ? '' : 'none';
    document.getElementById('subA1').placeholder = isPuzzel ? 'Antwoord' : 'Antwoord (mag leeg)';
    document.getElementById('submitModeHint').textContent = isPuzzel
      ? 'Maak drie vragen waarvan de antwoorden samen een kloppende formule vormen: A ×/÷/+/− B = C.'
      : 'Stuur één heldere vraag in. Weet je het antwoord niet zeker? Laat het leeg en voeg je bron of context toe.';
    updateSubmitPreview();
  }

  function submitNumber(value) {
    const v = parseFormattedNumber(String(value || '').trim());
    return Number.isFinite(v) && v > 0 ? v : null;
  }

  function updateSubmitPreview() {
    const preview = document.getElementById('submitPreview');
    if (!preview) return;
    const q1 = document.getElementById('subQ1').value.trim();
    const isPuzzel = submitMode === 'puzzel';
    const q2 = document.getElementById('subQ2').value.trim();
    const q3 = document.getElementById('subQ3').value.trim();
    const a1 = submitNumber(document.getElementById('subA1').value);
    const a2 = submitNumber(document.getElementById('subA2').value);
    const a3 = submitNumber(document.getElementById('subA3').value);
    const op = document.getElementById('subOperator').value;
    document.getElementById('subOperatorBadge').textContent = op;
    if (!q1) {
      preview.textContent = isPuzzel ? 'Begin bij vraag 1 om je puzzel te zien.' : 'Je voorbeeld verschijnt zodra je een vraag invult.';
      preview.className = 'submit-preview';
      return;
    }
    if (!isPuzzel) {
      const known = a1 !== null;
      preview.innerHTML = `<span class="submit-preview-calc">${escapeHtml(q1)}</span>` +
        (known
          ? `<span class="submit-preview-ok">✓ Antwoord: ${fmt(a1)}</span>`
          : '<span class="submit-preview-ok">Antwoord controleren we tijdens de review</span>');
      preview.className = 'submit-preview is-ok';
      return;
    }
    if (!q2 || !q3 || a1 === null || a2 === null || a3 === null) {
      preview.textContent = 'Vul alle drie de vragen en antwoorden in om je som te zien.';
      preview.className = 'submit-preview';
      return;
    }
    const expected = op === '×' ? a1 * a2 : op === '÷' ? a1 / a2 : op === '+' ? a1 + a2 : a1 - a2;
    const exact = Number.isInteger(expected) && Math.abs(expected - a3) < 1e-9;
    preview.innerHTML = `<span class="submit-preview-calc">${fmt(a1)} ${op} ${fmt(a2)} = ${fmt(a3)}</span>` +
      (exact
        ? '<span class="submit-preview-ok">✓ De berekening klopt</span>'
        : `<span class="submit-preview-bad">✗ Klopt niet: ${fmt(a1)} ${op} ${fmt(a2)} = ${fmt(expected)}</span>`);
    preview.className = 'submit-preview ' + (exact ? 'is-ok' : 'is-bad');
  }

  // Meldingen: is een eerdere inzending geaccepteerd/geweigerd? Dan toast.
  let submissionNotificationsChecked = false;
  async function checkSubmissionNotifications() {
    if (!supabaseClient || !currentUser || submissionNotificationsChecked) return;
    submissionNotificationsChecked = true;
    try {
      const { data, error } = await supabaseClient
        .from('user_notifications')
        .select('id, type, message, created_at')
        .eq('read', false)
        .order('created_at', { ascending: true })
        .limit(5);
      if (error || !data || !data.length) return;
      for (const n of data) {
        const accepted = n.type === 'submission_accepted';
        const denied = n.type === 'submission_denied';
        showNoticeToast(
          n.message,
          accepted ? '🎉' : denied ? '📮' : '💡',
          accepted
            ? statsCopy('Inzending geaccepteerd', 'Submission approved')
            : denied
              ? statsCopy('Inzending beoordeeld', 'Submission reviewed')
              : statsCopy('Nieuwe melding', 'New notification'));
        await supabaseClient.from('user_notifications').update({ read: true }).eq('id', n.id);
      }
    } catch (e) { /* meldingen zijn niet-kritiek */ }
  }

  async function submitQuestion(event) {
    event.preventDefault();
    // Inloggen is verplicht: zo is elke inzending herleidbaar en review-baar per account.
    if (!currentUser) {
      const box = document.getElementById('submitErrorBox');
      box.textContent = 'Log eerst in om een vraag in te sturen.';
      box.style.display = 'block';
      openAuthModal();
      return;
    }
    const box = document.getElementById('submitErrorBox');
    const showErr = (msg) => { box.textContent = msg; box.style.display = 'block'; };
    box.style.display = 'none';
    const isPuzzel = submitMode === 'puzzel';
    const q1 = document.getElementById('subQ1').value.trim();
    const q2 = document.getElementById('subQ2').value.trim();
    const q3 = document.getElementById('subQ3').value.trim();
    const a1raw = document.getElementById('subA1').value.trim();
    const a1 = submitNumber(a1raw);
    const a2 = submitNumber(document.getElementById('subA2').value);
    const a3 = submitNumber(document.getElementById('subA3').value);
    const op = document.getElementById('subOperator').value;
    const note = document.getElementById('subNote').value.trim() || null;
    const username = (document.getElementById('subUsername').value.trim() || currentUser.username || currentUser.email.split('@')[0]).slice(0, 20);
    if (q1.length < 8) { showErr('Vraag 1 is te kort — omschrijf hem echt als vraag.'); return; }
    if (!isPuzzel) {
      // Losse vraag: antwoord is optioneel; als het er staat moet het een getal zijn.
      if (a1raw && a1 === null) { showErr('Het antwoord moet een heel getal groter dan 0 zijn (of laat het veld leeg).'); return; }
    } else {
      if (!q2 || !q3) { showErr('Vul bij een puzzel alle drie de vragen in.'); return; }
      if (a1 === null || a2 === null || a3 === null) { showErr('Bij een puzzel moeten alle antwoorden hele getallen groter dan 0 zijn.'); return; }
      const expected = op === '×' ? a1 * a2 : op === '÷' ? a1 / a2 : op === '+' ? a1 + a2 : a1 - a2;
      if (!Number.isInteger(expected) || Math.abs(expected - a3) >= 1e-9) {
        showErr(`De som klopt niet: ${fmt(a1)} ${op} ${fmt(a2)} = ${fmt(expected)}. Pas de antwoorden of bewerking aan.`);
        return;
      }
      if (q3.length < 5) { showErr('Vraag 3 is te kort — omschrijf het resultaat echt als vraag.'); return; }
    }
    const btn = document.getElementById('submitQuestionBtn');
    btn.disabled = true;
    btn.textContent = 'Versturen…';
    try {
      if (!supabaseClient) throw new Error('Kan geen verbinding maken met de server. Probeer het later opnieuw.');
      const { error } = await supabaseClient.from('question_submissions').insert({
        type: submitMode,
        q1, a1: isPuzzel ? a1 : (a1raw ? a1 : null),
        q2: isPuzzel ? q2 : null, a2: isPuzzel ? a2 : null,
        q3: isPuzzel ? q3 : null, a3: isPuzzel ? a3 : null,
        operator: isPuzzel ? op : null,
        note, username,
        user_id: currentUser.id
      });
      if (error) throw error;
      ['subQ1','subQ2','subQ3','subA1','subA2','subA3','subNote'].forEach(id => { document.getElementById(id).value = ''; });
      updateSubmitPreview();
      showNoticeToast(
        statsCopy('Inzending ontvangen. Je krijgt bericht zodra de review klaar is.', 'Submission received. We will notify you when the review is complete.'),
        '✓', statsCopy('Inzending ontvangen', 'Submission received'));
    } catch (err) {
      showErr(mapAuthError(err.message));
    } finally {
      btn.disabled = false;
      btn.innerHTML = 'Verstuur inzending <span aria-hidden="true">→</span>';
    }
  }

  window.openSubmitQuestion = openSubmitQuestion;
  window.closeSubmitQuestion = closeSubmitQuestion;
  window.submitQuestion = submitQuestion;
  window.updateSubmitPreview = updateSubmitPreview;
  window.switchSubmitMode = switchSubmitMode;
  window.checkSubmissionNotifications = checkSubmissionNotifications;
