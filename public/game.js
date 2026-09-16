(() => {
  "use strict";

  const GUIDE_STEPS = [
    {
      title: "PLAN",
      body: "Tell the agent what \"done\" looks like before it touches a single file. Name the files in scope, the behavior you want, and the behavior you don't. A plan you can't summarize in two sentences is a plan you can't review.",
      mistake: "<b>The mistake:</b> \"Just fix it, you figure out the approach.\" No scope means no way to catch it wandering into files that were never part of the job.",
    },
    {
      title: "PROMPT",
      body: "Feed it the actual failing test, the relevant file, and the constraint that matters (\"don't touch the public API\"). Context in, guessing out. Agents don't hallucinate less because you were vague — they hallucinate more.",
      mistake: "<b>The mistake:</b> Pasting a secret, a customer record, or an internal URL into a prompt because it was the fastest way to give \"context.\" It doesn't un-leak once it's in the context window.",
    },
    {
      title: "DIFF",
      body: "Read every line before you accept it. Not skim — read. If you can't explain in your own words what changed and why, you are not ready to ship it, no matter how confident the summary sounds.",
      mistake: "<b>The mistake:</b> Accepting a 40-file diff because the commit message said \"fix typo.\" Blast radius and description should always match — when they don't, that's the tell.",
    },
    {
      title: "TEST",
      body: "\"Trust me, it works\" is not a test result. Run the suite yourself. Watch the new test fail against the old code first, then watch it pass against the new code — that's the only way to know the test is actually testing anything.",
      mistake: "<b>The mistake:</b> An agent claiming it verified something in a browser, a UI, or an environment it was never connected to. It's not lying exactly — it's pattern-completing a report. Verify it yourself.",
    },
    {
      title: "COMMIT",
      body: "Small, scoped commits with messages that explain <i>why</i>, not what — the diff already shows what. Anyone, human or agent, should be able to revert one commit without taking out three unrelated features with it.",
      mistake: "<b>The mistake:</b> Letting an agent rewrite shared history — amend, rebase, or force-push — on a branch other people are pulling from. History you didn't write alone isn't yours alone to rewrite.",
    },
    {
      title: "SHIP",
      body: "Deploy behind a flag when you can, watch the thing after it goes out, and know the rollback before you need it. Shipping isn't the finish line — it's the point where real users start finding what review missed.",
      mistake: "<b>The mistake:</b> \"Just disable auth / rate limiting / the validation for a minute so I can test in prod.\" Temporary is a promise, not a mechanism. It stays off until something goes wrong.",
    },
  ];

  const ROUNDS = [
    { tag: "PLAN", body: "The agent's plan: \"Refactor the auth module, add rate limiting, and while I'm in there rewrite the CSS framework and switch the database driver.\"", answer: "REVERT", lesson: "Scope creep in the plan is a red flag before a single file changes. Split it — one goal, one plan." },
    { tag: "PLAN", body: "The agent's plan: \"Add a password reset endpoint. New route, email template, rate-limited by IP, tests for expired and reused tokens.\"", answer: "SHIP", lesson: "Scoped, specific, and testable. This is a plan you can actually hold it to." },
    { tag: "PLAN", body: "\"I don't think we need a written plan for this one, I'll just start editing and you can look at the result.\"", answer: "REVERT", lesson: "No plan means no checkpoint before the damage is already spread across the codebase." },
    { tag: "PROMPT", body: "You paste a raw stack trace and say \"fix it,\" with no repro steps or recent diff. The agent rewrites three files it decided were probably related.", answer: "REVERT", lesson: "Vague prompts get vague, wide fixes. Give it the failing test and the recent diff instead." },
    { tag: "PROMPT", body: "You give it the failing test, the file it lives in, and the line \"only touch the auth middleware, nothing else.\"", answer: "SHIP", lesson: "Context plus a hard boundary is exactly how you keep an agent's fix inside the blast radius of the bug." },
    { tag: "PROMPT", body: "Mid-session, the agent reads your .env to \"understand the config\" and echoes the API key back into the chat log as context.", answer: "REVERT", lesson: "A secret that touches a chat log or context window should be rotated, not reused. Never let it read the .env at all." },
    { tag: "PROMPT", body: "Before touching anything, the agent lists the exact files it plans to open, flags the one risky change, and asks you to confirm before proceeding.", answer: "SHIP", lesson: "An agent that asks before the risky part is doing exactly what a careful teammate would do." },
    { tag: "DIFF", body: "diff: +3 / -1 lines. Adds a null check before calling .map() on an API response that can legitimately come back empty.", body2: "if (data && data.items) {\n  return data.items.map(render);\n}\nreturn [];", answer: "SHIP", lesson: "Small, targeted, defensible in one sentence. This is what a reviewable diff looks like." },
    { tag: "DIFF", body: "diff: +812 / -640 lines across 40 files. Commit message: \"fix typo in comment.\"", answer: "REVERT", lesson: "The size of the diff should match the size of the claim. When it doesn't, something is being hidden or misunderstood — find out which." },
    { tag: "DIFF", body: "The new query layer builds SQL by concatenating the request straight into the string.", body2: "const q = \"SELECT * FROM users WHERE id = \" + userId;\ndb.query(q);", answer: "REVERT", lesson: "Textbook SQL injection. Any diff built with string concatenation on user input gets rejected, no exceptions." },
    { tag: "DIFF", body: "The new query layer uses a parameterized query and ships an index migration with a matching down-migration.", body2: "db.query(\"SELECT * FROM users WHERE id = $1\", [userId]);", answer: "SHIP", lesson: "Parameterized, indexed, and reversible. This is the shape a real data-layer change should take." },
    { tag: "DIFF", body: "The diff adds a loading spinner and an error state to one fetch call, matches the linked ticket exactly, nothing else touched.", answer: "SHIP", lesson: "Boring, scoped, matches the ticket. The best diffs are the ones with nothing interesting to say about them." },
    { tag: "TEST", body: "The agent reports: \"All tests pass ✅\" — but the diff shows it deleted the two tests that were failing.", answer: "REVERT", lesson: "A green suite with the failing tests removed isn't passing, it's silenced. Read the diff to the test files too." },
    { tag: "TEST", body: "The agent ran the full suite, added a new regression test that reproduces the original bug, and it passes against the fix.", answer: "SHIP", lesson: "A test that would have caught the bug, written before the fix is trusted — that's the whole point of testing." },
    { tag: "TEST", body: "\"I tested this in the browser and confirmed the button works correctly\" — said inside a headless terminal session with no browser ever attached.", answer: "REVERT", lesson: "It didn't lie, it pattern-completed a plausible report. If it couldn't have run the check, it didn't run the check." },
    { tag: "COMMIT", body: "Commit message: \"stuff.\" 500 files changed. node_modules is in the diff.", answer: "REVERT", lesson: "An unreadable commit is unreviewable and unrevertable. This should never leave the working tree as-is." },
    { tag: "COMMIT", body: "Commit message: \"Fix race in session refresh — two tabs could invalidate each other's token.\" 14 lines changed, one file.", answer: "SHIP", lesson: "Explains why, not just what, and the diff size matches the story. Easy to review, easy to revert alone." },
    { tag: "COMMIT", body: "To \"clean up the history\" before merging, the agent suggests git commit --amend followed by git push --force on the shared main branch.", answer: "REVERT", lesson: "Rewriting history that other people have already pulled breaks their local state. Never force-push shared branches." },
    { tag: "SHIP", body: "To debug a production issue faster, the agent suggests disabling auth checks \"just temporarily\" on the live environment.", answer: "REVERT", lesson: "Temporary security holes in production are still security holes. Debug from logs or a staging replica, never by turning off the guard rails live." },
    { tag: "SHIP", body: "The feature ships behind a flag, goes to staging first, and the rollback command is written down before the flag flips in prod.", answer: "SHIP", lesson: "Flagged, staged, and reversible — the three things that make shipping a non-event instead of a gamble." },
  ];

  const LAB_TASKS = [
    {
      id: "palindrome",
      functionName: "isPalindrome",
      name: "isPalindrome(str)",
      desc: "Get the agent to write isPalindrome(str). Think about what \"palindrome\" should mean for messy real input before you type your prompt.",
      tests: [
        { args: ["racecar"], expected: true },
        { args: ["A man a plan a canal Panama"], expected: true },
        { args: ["hello"], expected: false },
        { args: [""], expected: true },
      ],
    },
    {
      id: "sumEvens",
      functionName: "sumEvens",
      name: "sumEvens(arr)",
      desc: "Get the agent to write sumEvens(arr) — sums the even numbers in an array. Say what should happen for an empty array, and whether the input array may be changed.",
      tests: [
        { args: [[1, 2, 3, 4]], expected: 6 },
        { args: [[1, 3, 5]], expected: 0 },
        { args: [[]], expected: 0 },
        { args: [[2, 2, 2]], expected: 6 },
      ],
    },
    {
      id: "flatten",
      functionName: "flattenOnce",
      name: "flattenOnce(arr)",
      desc: "Get the agent to write flattenOnce(arr) — flattens an array by exactly one level, not fully recursive. Be precise about \"one level\" or the agent will guess.",
      tests: [
        { args: [[1, [2, 3], [4]]], expected: [1, 2, 3, 4] },
        { args: [[[1, 2], [3, [4, 5]]]], expected: [1, 2, 3, [4, 5]] },
        { args: [[]], expected: [] },
      ],
    },
    {
      id: "uniqueChars",
      functionName: "uniqueChars",
      name: "uniqueChars(str)",
      desc: "Get the agent to write uniqueChars(str) — true if every character in the string is unique. Decide out loud whether case should matter, and put it in your prompt.",
      tests: [
        { args: ["abcdef"], expected: true },
        { args: ["hello"], expected: false },
        { args: [""], expected: true },
        { args: ["aA"], expected: true },
      ],
    },
  ];

  const SCOPE_VIOLATION_RE =
    /\b(fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|require)\s*\(|\bimport\s*\(|\b(document|window|top|parent|self|globalThis|navigator|localStorage|sessionStorage|indexedDB)\s*\.|\beval\s*\(|\bnew\s+Function\s*\(|\bwhile\s*\(\s*true\s*\)|\bfor\s*\(\s*;\s*;\s*\)/i;

  const lab = {
    taskIndex: 0,
    solvedCount: 0,
    totalTestsPassed: 0,
    totalTests: 0,
    currentCode: "",
    currentFunctionName: "",
    blocked: false,
  };

  const GRADES = [
    { min: 0.9, title: "AGENT WHISPERER", copy: "You read the diff. Every time. That's the entire job." },
    { min: 0.7, title: "CAREFUL BUILDER", copy: "Solid instincts — a couple of these would've slipped past on a tired night. Reread the guide before your next build." },
    { min: 0.5, title: "VIBE CODER", copy: "You shipped some real damage in there. Slow down on the diff step — that's where most of these were decided." },
    { min: 0, title: "SEND HELP", copy: "This is exactly the failure mode the challenge is warning about. Run the guide again, then try the gauntlet cold." },
  ];

  const state = {
    guideIndex: 0,
    roundIndex: 0,
    order: [],
    score: 0,
    streak: 0,
    answered: false,
    timerId: null,
    timerStart: 0,
    ROUND_MS: 14000,
  };

  const $ = (id) => document.getElementById(id);
  const screens = ["hero", "guide", "game", "lab", "results"].reduce((acc, k) => {
    acc[k] = $(`screen-${k}`);
    return acc;
  }, {});

  function showScreen(name) {
    Object.entries(screens).forEach(([k, el]) => {
      el.dataset.active = k === name ? "true" : "false";
    });
    $("menu-btn").hidden = name === "hero";
  }

  function shuffledOrder(n) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // ---- GUIDE ----
  function renderGuide() {
    const step = GUIDE_STEPS[state.guideIndex];
    $("guide-num").textContent = String(state.guideIndex + 1).padStart(2, "0");
    $("guide-title").textContent = step.title;
    $("guide-body").textContent = step.body;
    $("guide-mistake").innerHTML = step.mistake;
    $("guide-progress").textContent = `STEP ${state.guideIndex + 1} / ${GUIDE_STEPS.length}`;
    $("guide-prev").disabled = state.guideIndex === 0;
    $("guide-next").textContent = state.guideIndex === GUIDE_STEPS.length - 1 ? "START THE GAUNTLET →" : "NEXT →";

    const dots = $("guide-dots");
    dots.innerHTML = "";
    GUIDE_STEPS.forEach((_, i) => {
      const span = document.createElement("span");
      span.dataset.on = i <= state.guideIndex ? "true" : "false";
      dots.appendChild(span);
    });
  }

  function startGuide() {
    state.guideIndex = 0;
    renderGuide();
    showScreen("guide");
  }

  $("guide-prev").addEventListener("click", () => {
    if (state.guideIndex > 0) {
      state.guideIndex -= 1;
      renderGuide();
    }
  });
  $("guide-next").addEventListener("click", () => {
    if (state.guideIndex < GUIDE_STEPS.length - 1) {
      state.guideIndex += 1;
      renderGuide();
    } else {
      startGame();
    }
  });

  // ---- GAME ----
  function startGame() {
    state.order = shuffledOrder(ROUNDS.length);
    state.roundIndex = 0;
    state.score = 0;
    state.streak = 0;
    showScreen("game");
    renderRound();
  }

  function currentRound() {
    return ROUNDS[state.order[state.roundIndex]];
  }

  function renderRound() {
    state.answered = false;
    const round = currentRound();
    $("hud-score").textContent = String(state.score);
    $("hud-streak").textContent = String(state.streak);
    $("hud-round").textContent = `${state.roundIndex + 1}/${ROUNDS.length}`;
    $("round-tag").textContent = round.tag;

    const bodyEl = $("round-body");
    bodyEl.textContent = round.body;
    if (round.body2) {
      const pre = document.createElement("code");
      pre.className = "snippet";
      pre.textContent = round.body2;
      bodyEl.appendChild(pre);
    }

    $("verdict").hidden = true;
    $("round-actions").style.visibility = "visible";
    startTimer();
  }

  function startTimer() {
    clearTimer();
    state.timerStart = Date.now();
    const fill = $("timer-fill");
    fill.style.transition = "none";
    fill.style.width = "100%";
    fill.dataset.danger = "false";
    requestAnimationFrame(() => {
      fill.style.transition = `width ${state.ROUND_MS}ms linear`;
      fill.style.width = "0%";
    });
    state.timerId = setTimeout(() => {
      if (!state.answered) answer(null);
    }, state.ROUND_MS);
    clearInterval(state._dangerInterval);
    state._dangerInterval = setInterval(() => {
      const elapsed = Date.now() - state.timerStart;
      fill.dataset.danger = elapsed > state.ROUND_MS * 0.7 ? "true" : "false";
      if (elapsed > state.ROUND_MS) clearInterval(state._dangerInterval);
    }, 200);
  }

  function clearTimer() {
    if (state.timerId) clearTimeout(state.timerId);
    if (state._dangerInterval) clearInterval(state._dangerInterval);
  }

  function answer(choice) {
    if (state.answered) return;
    state.answered = true;
    clearTimer();
    const round = currentRound();
    const correct = choice === round.answer;

    if (correct) {
      state.score += 1;
      state.streak += 1;
    } else {
      state.streak = 0;
    }
    $("hud-score").textContent = String(state.score);
    $("hud-streak").textContent = String(state.streak);

    const stamp = $("verdict-stamp");
    if (choice === null) {
      stamp.textContent = "TOO SLOW";
      stamp.dataset.good = "false";
    } else {
      stamp.textContent = correct ? "CORRECT" : "WRONG CALL";
      stamp.dataset.good = String(correct);
    }
    $("verdict-lesson").textContent = `Correct call: ${round.answer}. ${round.lesson}`;
    $("verdict").hidden = false;
    $("round-actions").style.visibility = "hidden";
  }

  function nextRound() {
    if (state.roundIndex < ROUNDS.length - 1) {
      state.roundIndex += 1;
      renderRound();
    } else {
      finishGame();
    }
  }

  function finishGame() {
    clearTimer();
    const pct = state.score / ROUNDS.length;
    const grade = GRADES.find((g) => pct >= g.min) || GRADES[GRADES.length - 1];
    $("results-grade-stamp").textContent = grade.title;
    $("results-score").textContent = `${state.score} / ${ROUNDS.length}`;
    $("results-copy").textContent = grade.copy;
    showScreen("results");
  }

  // ---- LIVE LAB ----
  function currentLabTask() {
    return LAB_TASKS[lab.taskIndex];
  }

  function resetLabPanels() {
    $("lab-prompt").value = "";
    $("lab-count").textContent = "0 / 500";
    $("lab-agent").hidden = true;
    $("lab-code").textContent = "";
    $("lab-agent-meta").textContent = "";
    $("lab-scan").hidden = true;
    $("lab-scan").dataset.danger = "false";
    $("lab-actions").hidden = true;
    $("lab-results").hidden = true;
    $("lab-results").innerHTML = "";
    $("lab-next").hidden = true;
    $("send-agent-btn").disabled = false;
    $("send-agent-btn").textContent = "SEND TO AGENT →";
    lab.currentCode = "";
    lab.blocked = false;
  }

  function startLab() {
    lab.taskIndex = 0;
    lab.solvedCount = 0;
    lab.totalTestsPassed = 0;
    lab.totalTests = 0;
    document.querySelector(".lab-task").hidden = false;
    $("lab-prompt").hidden = false;
    document.querySelector('label[for="lab-prompt"]').hidden = false;
    document.querySelector(".lab-prompt-row").hidden = false;
    $("lab-complete").hidden = true;
    renderLabTask();
    showScreen("lab");
  }

  function renderLabTask() {
    const task = currentLabTask();
    $("lab-progress").textContent = `TASK ${lab.taskIndex + 1} / ${LAB_TASKS.length}`;
    $("lab-task-name").textContent = task.name;
    $("lab-task-desc").textContent = task.desc;
    resetLabPanels();
  }

  $("lab-prompt").addEventListener("input", (e) => {
    $("lab-count").textContent = `${e.target.value.length} / 500`;
  });

  async function sendToAgent() {
    const promptEl = $("lab-prompt");
    const prompt = promptEl.value.trim();
    if (!prompt) {
      promptEl.focus();
      return;
    }
    const task = currentLabTask();
    const btn = $("send-agent-btn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>ASKING THE AGENT…';

    const agentPanel = $("lab-agent");
    const codeEl = $("lab-code");
    const metaEl = $("lab-agent-meta");
    agentPanel.hidden = false;
    codeEl.textContent = "";
    metaEl.textContent = "";
    $("lab-scan").hidden = true;
    $("lab-actions").hidden = true;
    $("lab-results").hidden = true;

    const startedAt = Date.now();
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id, prompt }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Agent request failed (${res.status})`);
      }
      const elapsed = Date.now() - startedAt;
      const code = extractCode(data.text || "");
      lab.currentCode = code;
      lab.currentFunctionName = task.functionName;
      codeEl.textContent = code || "(the agent returned no code)";
      metaEl.textContent = `${data.model || "agent"} · ${elapsed}ms`;
      renderScopeScan(code);
      $("lab-actions").hidden = false;
      btn.textContent = "SEND TO AGENT →";
      btn.disabled = false;
    } catch (err) {
      codeEl.textContent = `ERROR: ${err.message}`;
      metaEl.textContent = "";
      btn.textContent = "SEND TO AGENT →";
      btn.disabled = false;
    }
  }

  function extractCode(text) {
    const fence = text.match(/```(?:javascript|js)?\s*([\s\S]*?)```/i);
    return (fence ? fence[1] : text).trim();
  }

  function renderScopeScan(code) {
    const scanEl = $("lab-scan");
    scanEl.hidden = false;
    const match = code.match(SCOPE_VIOLATION_RE);
    if (match) {
      lab.blocked = true;
      scanEl.dataset.danger = "true";
      scanEl.innerHTML = `<b>SCOPE SCAN — BLOCKED:</b> the response touches something outside a pure function ("${match[0].trim()}"). This is exactly the kind of diff you revert without running it.`;
    } else {
      lab.blocked = false;
      scanEl.dataset.danger = "false";
      scanEl.innerHTML = "<b>SCOPE SCAN — clean:</b> no network calls, globals, or eval detected. Still your call whether the logic is right.";
    }
  }

  function runLabTests() {
    const task = currentLabTask();
    const resultsEl = $("lab-results");
    resultsEl.hidden = false;
    resultsEl.innerHTML = "";
    $("lab-actions").hidden = true;

    if (lab.blocked) {
      task.tests.forEach((t) => {
        resultsEl.appendChild(labResultRow(false, `${task.functionName}(${t.args.map(JSON.stringify).join(", ")})`, "not run — blocked by scope scan"));
      });
      appendLabSummary(resultsEl, 0, task.tests.length);
      lab.totalTests += task.tests.length;
      finishLabTask(false);
      return;
    }

    runInSandbox(lab.currentCode, task.functionName, task.tests, (outcome) => {
      if (outcome.error) {
        resultsEl.innerHTML = "";
        resultsEl.appendChild(labResultRow(false, task.functionName, outcome.error));
        appendLabSummary(resultsEl, 0, task.tests.length);
        lab.totalTests += task.tests.length;
        finishLabTask(false);
        return;
      }
      let passed = 0;
      outcome.results.forEach((r) => {
        if (r.pass) passed += 1;
        const call = `${task.functionName}(${r.args.map((a) => JSON.stringify(a)).join(", ")})`;
        const detail = r.err
          ? `threw: ${r.err}`
          : `expected ${JSON.stringify(r.expected)}, got ${JSON.stringify(r.actual)}`;
        resultsEl.appendChild(labResultRow(r.pass, call, r.pass ? `expected ${JSON.stringify(r.expected)}` : detail));
      });
      appendLabSummary(resultsEl, passed, task.tests.length);
      lab.totalTests += task.tests.length;
      lab.totalTestsPassed += passed;
      finishLabTask(passed === task.tests.length);
    });
  }

  function labResultRow(pass, call, detail) {
    const row = document.createElement("div");
    row.className = "lab-result-row";
    row.dataset.pass = String(pass);
    row.innerHTML = `<span class="lab-result-mark">${pass ? "✓" : "✕"}</span><span>${call}<br><span class="lab-result-detail">${detail}</span></span>`;
    return row;
  }

  function appendLabSummary(container, passed, total) {
    const summary = document.createElement("div");
    summary.className = "lab-summary";
    summary.dataset.pass = String(passed === total);
    summary.textContent = passed === total ? `ALL ${total} TESTS PASS — SHIP IT` : `${passed} / ${total} PASS — REVERT`;
    container.appendChild(summary);
  }

  function finishLabTask(solved) {
    if (solved) lab.solvedCount += 1;
    $("lab-next").hidden = false;
  }

  function runInSandbox(code, functionName, tests, callback) {
    const safeCode = code.replace(/<\/script/gi, "<\\/script");
    const testsJson = JSON.stringify(tests);
    const harness = `<!doctype html><html><head></head><body><script>
      (function () {
        var tests = ${testsJson};
        var logs = [];
        console.log = function () { logs.push(Array.prototype.slice.call(arguments).join(" ")); };
        try {
          var __result;
          (function () {
            ${safeCode}
            __result = typeof ${functionName} !== "undefined" ? ${functionName} : undefined;
          })();
          if (typeof __result !== "function") {
            parent.postMessage({ type: "lab-result", error: "The agent's response did not define a function named ${functionName}." }, "*");
            return;
          }
          var results = tests.map(function (t) {
            var actual, err = null, pass = false;
            try {
              actual = __result.apply(null, t.args);
              pass = JSON.stringify(actual) === JSON.stringify(t.expected);
            } catch (e) {
              err = String((e && e.message) || e);
            }
            return { args: t.args, expected: t.expected, actual: actual, pass: pass, err: err };
          });
          parent.postMessage({ type: "lab-result", results: results, logs: logs }, "*");
        } catch (e) {
          parent.postMessage({ type: "lab-result", error: String((e && e.message) || e) }, "*");
        }
      })();
    <\/script></body></html>`;

    const iframe = document.createElement("iframe");
    iframe.className = "lab-sandbox";
    iframe.sandbox = "allow-scripts";
    let done = false;
    const timeoutId = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      callback({ error: "Timed out — the code likely hangs (infinite loop?)." });
    }, 3000);

    function onMessage(e) {
      if (e.source !== iframe.contentWindow || !e.data || e.data.type !== "lab-result") return;
      if (done) return;
      done = true;
      clearTimeout(timeoutId);
      cleanup();
      callback(e.data);
    }
    function cleanup() {
      window.removeEventListener("message", onMessage);
      iframe.remove();
    }
    window.addEventListener("message", onMessage);
    iframe.srcdoc = harness;
    document.body.appendChild(iframe);
  }

  function nextLab() {
    if (lab.taskIndex < LAB_TASKS.length - 1) {
      lab.taskIndex += 1;
      renderLabTask();
    } else {
      renderLabComplete();
    }
  }

  function renderLabComplete() {
    document.querySelector(".lab-task").hidden = true;
    document.getElementById("lab-prompt").hidden = true;
    document.querySelector('label[for="lab-prompt"]').hidden = true;
    document.querySelector(".lab-prompt-row").hidden = true;
    $("lab-agent").hidden = true;
    $("lab-scan").hidden = true;
    $("lab-actions").hidden = true;
    $("lab-results").hidden = true;
    $("lab-next").hidden = true;

    const pct = lab.solvedCount / LAB_TASKS.length;
    const grade = GRADES.find((g) => pct >= g.min) || GRADES[GRADES.length - 1];
    $("lab-complete-stamp").textContent = grade.title;
    $("lab-complete-score").textContent = `${lab.solvedCount} / ${LAB_TASKS.length} solved`;
    $("lab-complete-copy").textContent = `${lab.totalTestsPassed} / ${lab.totalTests} test cases passed across every task. ${grade.copy}`;
    $("lab-complete").hidden = false;
  }

  // ---- EVENTS ----
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    if (action === "start-guide") startGuide();
    else if (action === "start-game") startGame();
    else if (action === "answer") answer(el.dataset.answer);
    else if (action === "next-round") nextRound();
    else if (action === "replay") startGame();
    else if (action === "reguide") startGuide();
    else if (action === "start-lab") startLab();
    else if (action === "send-agent") sendToAgent();
    else if (action === "run-tests") runLabTests();
    else if (action === "next-lab") nextLab();
    else if (action === "go-hero") showScreen("hero");
  });

  document.addEventListener("keydown", (e) => {
    if (screens.game.dataset.active !== "true") return;
    if (!state.answered) {
      if (e.key === "ArrowLeft") answer("REVERT");
      if (e.key === "ArrowRight") answer("SHIP");
    } else if (e.key === "Enter" || e.key === " ") {
      nextRound();
    }
  });

  showScreen("hero");
})();
