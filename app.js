(() => {
  const CLASS_MEMBERS = [
    "강은석", "강진우", "고동국", "김금성", "김세은",
    "박가온", "박누아", "박소연", "신민서", "신훈민",
    "오민규", "이신우", "이지훈", "이진욱", "임재민",
    "장혜원", "정연승", "정준서", "조정우", "조주상",
    "한지혁"
  ];

  const STORAGE_KEY = "pingpong-bracket-v1";
  const TEAM_SIZE = 2;
  const MAX_TEAM = 3;
  const GAME_POINT = 11;
  const RETIRED_NAMES = ["임"];

  const state = {
    extras: [],
    teams: [],
    unused: [],
    bracket: null,
    scoreboard: defaultScoreboard(),
    step: 1,
    selected: null
  };

  let idSeq = 1;
  let toastTimer = 0;
  let dragName = null;

  function uid() {
    idSeq += 1;
    return "t" + idSeq;
  }

  function isRetired(name) {
    return RETIRED_NAMES.includes(name);
  }

  function keepPerson(name) {
    return typeof name === "string" && name.trim() && !isRetired(name);
  }

  function allMembers() {
    return CLASS_MEMBERS.concat(state.extras);
  }

  function isClass(name) {
    return CLASS_MEMBERS.includes(name);
  }

  function classNumber(name) {
    const i = CLASS_MEMBERS.indexOf(name);
    return i >= 0 ? String(i + 1).padStart(2, "0") : "외부";
  }

  function randomInt(n) {
    if (n <= 1) return 0;
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const max = Math.floor(0x100000000 / n) * n;
      const buf = new Uint32Array(1);
      let x;
      do {
        crypto.getRandomValues(buf);
        x = buf[0];
      } while (x >= max);
      return x % n;
    }
    return Math.floor(Math.random() * n);
  }

  function shuffle(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function prevPow2(n) {
    let p = 1;
    while (p * 2 <= n) p *= 2;
    return p;
  }

  function spreadSlots(playIns, byes) {
    const total = playIns.length + byes.length;
    if (!playIns.length) return byes.slice();
    if (!byes.length) return playIns.slice();
    const result = new Array(total);
    const step = total / playIns.length;
    const playAt = new Set();
    for (let i = 0; i < playIns.length; i++) playAt.add(Math.floor(i * step));
    let pi = 0;
    let bi = 0;
    for (let i = 0; i < total; i++) {
      if (playAt.has(i) && pi < playIns.length) result[i] = playIns[pi++];
      else if (bi < byes.length) result[i] = byes[bi++];
      else result[i] = playIns[pi++];
    }
    const offset = randomInt(total);
    return result.slice(offset).concat(result.slice(0, offset));
  }

  function emptyBoard(partial) {
    return Object.assign({
      key: "standalone",
      roundIndex: null,
      matchIndex: null,
      teamA: null,
      teamB: null,
      customA: "A팀",
      customB: "B팀",
      format: 3,
      firstServer: "a",
      points: []
    }, partial || {});
  }

  function defaultScoreboard() {
    return {
      format: 3,
      active: "standalone",
      boards: {
        standalone: emptyBoard({ key: "standalone" })
      }
    };
  }

  function currentBoard() {
    const sb = state.scoreboard;
    if (!sb.boards[sb.active]) sb.active = "standalone";
    if (!sb.boards.standalone) sb.boards.standalone = emptyBoard({ key: "standalone" });
    return sb.boards[sb.active];
  }

  function otherSide(side) {
    return side === "a" ? "b" : "a";
  }

  function gameWon(a, b) {
    return (a >= GAME_POINT || b >= GAME_POINT) && Math.abs(a - b) >= 2;
  }

  function gamesToWin(format) {
    return Math.ceil((format === 5 ? 5 : 3) / 2);
  }

  function deriveBoard(board) {
    const format = board.format === 5 ? 5 : 3;
    const need = gamesToWin(format);
    const games = [];
    let a = 0;
    let b = 0;
    let winner = null;
    for (let i = 0; i < board.points.length; i++) {
      if (winner) break;
      const p = board.points[i];
      if (p === "a") a += 1;
      else if (p === "b") b += 1;
      if (gameWon(a, b)) {
        games.push({ a: a, b: b });
        a = 0;
        b = 0;
        const aWins = games.filter((g) => g.a > g.b).length;
        const bWins = games.filter((g) => g.b > g.a).length;
        if (aWins >= need) winner = "a";
        else if (bWins >= need) winner = "b";
      }
    }
    return {
      format,
      need,
      games,
      currentA: a,
      currentB: b,
      gamesA: games.filter((g) => g.a > g.b).length,
      gamesB: games.filter((g) => g.b > g.a).length,
      winner,
      gameIndex: games.length,
      deuce: a >= 10 && b >= 10,
      finished: !!winner
    };
  }

  function currentServer(board, derived) {
    const first = board.firstServer === "b" ? "b" : "a";
    const gameFirst = derived.gameIndex % 2 === 0 ? first : otherSide(first);
    const total = derived.currentA + derived.currentB;
    const deuce = derived.currentA >= 10 && derived.currentB >= 10;
    const turn = deuce ? total - 10 : Math.floor(total / 2);
    return turn % 2 === 0 ? gameFirst : otherSide(gameFirst);
  }

  function boardSideInfo(board, side) {
    const id = side === "a" ? board.teamA : board.teamB;
    if (id) {
      const team = teamById(id);
      if (team) {
        return {
          id: team.id,
          name: team.name,
          members: team.members
        };
      }
    }
    return {
      id: null,
      name: (side === "a" ? board.customA : board.customB) || (side === "a" ? "A팀" : "B팀"),
      members: []
    };
  }

  function sanitizeScoreboard(raw) {
    const next = defaultScoreboard();
    if (!raw || typeof raw !== "object") return next;
    if (raw.format === 5 || raw.format === 3) next.format = raw.format;
    if (typeof raw.active === "string") next.active = raw.active;
    if (raw.boards && typeof raw.boards === "object") {
      next.boards = {};
      Object.keys(raw.boards).forEach((key) => {
        const b = raw.boards[key];
        if (!b || typeof b !== "object") return;
        next.boards[key] = emptyBoard({
          key,
          roundIndex: Number.isInteger(b.roundIndex) ? b.roundIndex : null,
          matchIndex: Number.isInteger(b.matchIndex) ? b.matchIndex : null,
          teamA: typeof b.teamA === "string" ? b.teamA : null,
          teamB: typeof b.teamB === "string" ? b.teamB : null,
          customA: typeof b.customA === "string" && b.customA.trim() ? b.customA : "A팀",
          customB: typeof b.customB === "string" && b.customB.trim() ? b.customB : "B팀",
          format: b.format === 5 ? 5 : 3,
          firstServer: b.firstServer === "b" ? "b" : "a",
          points: Array.isArray(b.points) ? b.points.filter((p) => p === "a" || p === "b") : []
        });
      });
      if (!next.boards.standalone) next.boards.standalone = emptyBoard({ key: "standalone" });
    }
    if (!next.boards[next.active]) next.active = "standalone";
    return next;
  }

  function pruneScoreboards() {
    const keep = { standalone: true };
    if (state.bracket) {
      state.bracket.rounds.forEach((round) => {
        round.forEach((match) => {
          keep[match.id] = true;
        });
      });
    }
    Object.keys(state.scoreboard.boards).forEach((key) => {
      if (!keep[key]) delete state.scoreboard.boards[key];
    });
    if (!state.scoreboard.boards[state.scoreboard.active]) {
      state.scoreboard.active = "standalone";
    }
  }

  function migrateStep(data) {
    const raw = data.step;
    if (typeof raw !== "number") return 1;
    if (Array.isArray(data.aces)) {
      const map = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 4 };
      return map[raw] || 1;
    }
    if (raw >= 1 && raw <= 4) return raw;
    return 1;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        extras: state.extras,
        teams: state.teams,
        unused: state.unused,
        bracket: state.bracket,
        scoreboard: state.scoreboard,
        step: state.step,
        idSeq
      }));
    } catch (err) {
      toast("저장에 실패했습니다.", "warn");
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.extras)) {
        state.extras = unique(data.extras.filter((n) => keepPerson(n) && !CLASS_MEMBERS.includes(n)));
      }
      const members = allMembers();
      if (Array.isArray(data.teams)) {
        state.teams = data.teams.map((team) => ({
          id: typeof team.id === "string" ? team.id : uid(),
          name: typeof team.name === "string" && team.name.trim() ? team.name : "팀",
          members: unique((Array.isArray(team.members) ? team.members : []).filter(keepPerson))
        }));
      }
      if (Array.isArray(data.unused)) {
        state.unused = unique(data.unused.filter((n) => keepPerson(n) && members.includes(n)));
      }
      if (data.bracket) state.bracket = data.bracket;
      if (data.scoreboard) state.scoreboard = sanitizeScoreboard(data.scoreboard);
      state.step = migrateStep(data);
      if (typeof data.idSeq === "number") idSeq = data.idSeq;
      pruneMissingPeople();
      pruneScoreboards();
    } catch (err) {
      /* ignore broken storage */
    }
  }

  function unique(arr) {
    return arr.filter((n, i) => arr.indexOf(n) === i);
  }

  function pruneMissingPeople() {
    const members = allMembers();
    state.extras = unique(state.extras.filter((n) => keepPerson(n) && !CLASS_MEMBERS.includes(n)));
    state.unused = unique(state.unused.filter((n) => keepPerson(n) && members.includes(n)));
    const before = state.teams.length;
    state.teams.forEach((team) => {
      team.members = unique((team.members || []).filter((n) => keepPerson(n) && members.includes(n)));
    });
    state.teams = state.teams.filter((team) => team.members.length > 0);
    if (state.teams.length !== before) {
      state.bracket = null;
    }
  }

  function toast(message, kind) {
    const el = document.getElementById("toast");
    el.textContent = message;
    el.className = "toast show" + (kind ? " " + kind : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function setStep(n) {
    state.step = n;
    save();
    render();
  }

  function addExtra(raw) {
    const name = String(raw || "").trim().replace(/\s+/g, " ");
    if (!name) {
      toast("이름을 입력하세요.", "warn");
      return;
    }
    if (isRetired(name)) {
      toast("이 이름은 명단에서 빠졌습니다.", "warn");
      return;
    }
    if (allMembers().includes(name)) {
      toast("이미 있는 이름입니다.", "warn");
      return;
    }
    state.extras.push(name);
    if (state.teams.length) state.unused.push(name);
    save();
    render();
    toast(name + " 님을 추가했습니다.", "ok");
  }

  function removeExtra(name) {
    if (isClass(name)) return;
    state.extras = state.extras.filter((n) => n !== name);
    state.unused = state.unused.filter((n) => n !== name);
    const before = state.teams.length;
    state.teams.forEach((team) => {
      team.members = team.members.filter((n) => n !== name);
    });
    state.teams = state.teams.filter((team) => team.members.length > 0);
    if (state.teams.length !== before) {
      state.bracket = null;
      pruneScoreboards();
    }
    pruneMissingPeople();
    save();
    render();
    toast(name + " 님을 목록에서 뺐습니다.");
  }

  function teamById(id) {
    return state.teams.find((t) => t.id === id);
  }

  function generateTeams() {
    const members = allMembers().filter(keepPerson);
    if (!members.length) {
      toast("참가 멤버가 없습니다.", "warn");
      return;
    }

    const shuffled = shuffle(members);
    const teams = [];
    for (let i = 0; i + 1 < shuffled.length; i += TEAM_SIZE) {
      const group = shuffled.slice(i, i + TEAM_SIZE);
      teams.push({
        id: uid(),
        name: group[0] + " 팀",
        members: group
      });
    }
    if (shuffled.length % TEAM_SIZE === 1) {
      const leftover = shuffled[shuffled.length - 1];
      if (!teams.length) {
        teams.push({
          id: uid(),
          name: leftover + " 팀",
          members: [leftover]
        });
      } else {
        teams[randomInt(teams.length)].members.push(leftover);
      }
    }

    state.teams = shuffle(teams);
    state.unused = [];
    state.bracket = null;
    pruneScoreboards();
    state.selected = null;
    save();
    render();
    toast("팀을 무작위로 구성했습니다.", "ok");
  }

  function promoteLeftovers() {
    const leftovers = state.unused.slice();
    if (!leftovers.length) {
      toast("남은 인원이 없습니다.");
      return;
    }
    leftovers.forEach((name) => {
      state.teams.forEach((team) => {
        team.members = team.members.filter((n) => n !== name);
      });
      state.teams.push({
        id: uid(),
        name: name + " 팀",
        members: [name]
      });
    });
    state.teams = state.teams.filter((team) => team.members.length > 0);
    state.unused = [];
    state.bracket = null;
    pruneScoreboards();
    save();
    render();
    toast(leftovers.length + "개의 1인 팀을 만들었습니다.", "ok");
  }

  function canMove(name, targetTeamId) {
    if (targetTeamId === "unused") return { ok: true };
    const team = teamById(targetTeamId);
    if (!team) return { ok: false, reason: "팀을 찾을 수 없습니다." };
    if (team.members.includes(name)) return { ok: false, reason: "이미 그 팀입니다." };
    if (team.members.length >= MAX_TEAM) return { ok: false, reason: "한 팀은 최대 3명입니다." };
    return { ok: true };
  }

  function moveMember(name, targetTeamId) {
    const check = canMove(name, targetTeamId);
    if (!check.ok) {
      toast(check.reason, "warn");
      return false;
    }

    state.teams.forEach((team) => {
      team.members = team.members.filter((n) => n !== name);
    });
    state.unused = state.unused.filter((n) => n !== name);

    if (targetTeamId === "unused") {
      if (!state.unused.includes(name)) state.unused.push(name);
    } else {
      teamById(targetTeamId).members.push(name);
    }

    state.teams = state.teams.filter((team) => team.members.length > 0);
    state.selected = null;
    state.bracket = null;
    pruneScoreboards();
    save();
    render();
    return true;
  }

  function onMemberClick(name) {
    if (state.selected === name) {
      state.selected = null;
      render();
      return;
    }
    state.selected = name;
    render();
  }

  function onTeamClick(teamId) {
    if (!state.selected) return;
    moveMember(state.selected, teamId);
  }

  function renameTeam(id, name) {
    const team = teamById(id);
    if (!team) return;
    const next = name.trim() || (team.members[0] ? team.members[0] + " 팀" : "팀");
    team.name = next;
    save();
  }

  function buildBracket() {
    if (state.teams.length < 2) {
      toast("대진표에는 팀이 2개 이상 필요합니다.", "warn");
      return;
    }
    const oversize = state.teams.some((t) => t.members.length < 1 || t.members.length > MAX_TEAM);
    if (oversize) {
      toast("한 팀은 최대 3명입니다.", "warn");
      return;
    }

    const seeded = shuffle(state.teams);
    const n = seeded.length;
    const mainSize = prevPow2(n);
    const playInCount = n - mainSize;
    const playing = seeded.slice(0, playInCount * 2);
    const byeTeams = seeded.slice(playInCount * 2);
    const startR = playInCount > 0 ? 1 : 0;
    const rounds = [];

    if (playInCount > 0) {
      const playIn = [];
      for (let i = 0; i < playInCount; i++) {
        playIn.push({
          id: "r0m" + i,
          a: playing[i * 2].id,
          b: playing[i * 2 + 1].id,
          winner: null,
          bye: false,
          feedRound: startR,
          feedMatch: 0,
          feedSide: "a"
        });
      }
      rounds.push(playIn);
    }

    let roundSize = mainSize / 2;
    let r = startR;
    while (roundSize >= 1) {
      const round = [];
      for (let i = 0; i < roundSize; i++) {
        round.push({
          id: "r" + r + "m" + i,
          a: null,
          b: null,
          aFixed: false,
          bFixed: false,
          winner: null,
          bye: false
        });
      }
      rounds.push(round);
      roundSize /= 2;
      r += 1;
    }

    if (playInCount > 0) {
      const playIns = Array.from({ length: playInCount }, (_, i) => ({ type: "playin", index: i }));
      const byes = byeTeams.map((t) => ({ type: "team", id: t.id }));
      const slots = spreadSlots(playIns, byes);
      slots.forEach((slot, i) => {
        const match = rounds[startR][Math.floor(i / 2)];
        const side = i % 2 === 0 ? "a" : "b";
        if (slot.type === "team") {
          match[side] = slot.id;
          match[side + "Fixed"] = true;
        } else {
          const feed = rounds[0][slot.index];
          feed.feedRound = startR;
          feed.feedMatch = Math.floor(i / 2);
          feed.feedSide = side;
        }
      });
    } else {
      seeded.forEach((team, i) => {
        const match = rounds[0][Math.floor(i / 2)];
        const side = i % 2 === 0 ? "a" : "b";
        match[side] = team.id;
        match[side + "Fixed"] = true;
      });
    }

    state.bracket = {
      rounds,
      order: seeded.map((t) => t.id),
      playIn: playInCount > 0
    };
    pruneScoreboards();
    propagateWinners();
    save();
    render();
    toast(playInCount ? "대진표를 섞었습니다. 1회전만 부전승이 있습니다." : "대진표를 무작위로 만들었습니다.", "ok");
  }

  function resetWinners() {
    if (!state.bracket) return;
    const playIn = !!state.bracket.playIn;
    state.bracket.rounds.forEach((round, ri) => {
      round.forEach((match) => {
        if (ri === 0 && match.bye) {
          match.winner = match.a || match.b;
          return;
        }
        match.winner = null;
        if (playIn) {
          if (ri > 0) {
            if (!match.aFixed) match.a = null;
            if (!match.bFixed) match.b = null;
          }
        } else if (ri > 0) {
          match.a = null;
          match.b = null;
          match.bye = false;
        }
      });
    });
    propagateWinners();
    save();
    render();
  }

  function pickWinner(roundIndex, matchIndex, teamId, force) {
    const match = state.bracket.rounds[roundIndex][matchIndex];
    if (!teamId || match.bye) return;
    if (teamId !== match.a && teamId !== match.b) return;
    if (!force && match.winner === teamId) {
      match.winner = null;
    } else {
      match.winner = teamId;
    }
    clearDownstream(roundIndex, matchIndex);
    propagateWinners();
    save();
    render();
  }

  function addPoint(side) {
    const board = currentBoard();
    const before = deriveBoard(board);
    if (before.winner) {
      toast("경기가 끝났습니다. 한 점 취소 또는 점수 초기화를 사용하세요.");
      return;
    }
    board.points.push(side);
    const after = deriveBoard(board);
    save();
    render();
    if (after.winner) {
      toast(boardSideInfo(board, after.winner).name + " 승리!", "ok");
    } else if (after.games.length > before.games.length) {
      const g = after.games[after.games.length - 1];
      toast("게임 종료 " + g.a + " : " + g.b);
    }
  }

  function minusPoint(side) {
    const board = currentBoard();
    const idx = board.points.lastIndexOf(side);
    if (idx < 0) return;
    board.points.splice(idx, 1);
    save();
    render();
  }

  function undoPoint() {
    const board = currentBoard();
    if (!board.points.length) {
      toast("취소할 점수가 없습니다.");
      return;
    }
    board.points.pop();
    save();
    render();
  }

  function resetScoreboard() {
    const board = currentBoard();
    board.points = [];
    save();
    render();
    toast("점수를 초기화했습니다.");
  }

  function swapFirstServer() {
    const board = currentBoard();
    board.firstServer = otherSide(board.firstServer === "b" ? "b" : "a");
    save();
    render();
  }

  function setBoardTeam(side, teamId) {
    const board = currentBoard();
    if (board.key !== "standalone") return;
    const otherKey = side === "a" ? "teamB" : "teamA";
    const thisKey = side === "a" ? "teamA" : "teamB";
    const nextId = teamId || null;
    if (nextId && board[otherKey] === nextId) {
      toast("같은 팀을 양쪽에 둘 수 없습니다.", "warn");
      render();
      return;
    }
    const changed = board[thisKey] !== nextId;
    board[thisKey] = nextId;
    if (changed && board.points.length) {
      board.points = [];
      toast("팀이 바뀌어 점수를 초기화했습니다.");
    }
    save();
    render();
  }

  function setBoardCustom(side, name) {
    const board = currentBoard();
    const fallback = side === "a" ? "A팀" : "B팀";
    const next = String(name || "").trim() || fallback;
    if (side === "a") board.customA = next;
    else board.customB = next;
    save();
    render();
  }

  function setBoardFormat(format) {
    const next = format === 5 ? 5 : 3;
    state.scoreboard.format = next;
    currentBoard().format = next;
    save();
    render();
  }

  function openStandaloneBoard() {
    state.scoreboard.active = "standalone";
    if (!state.scoreboard.boards.standalone) {
      state.scoreboard.boards.standalone = emptyBoard({
        key: "standalone",
        format: state.scoreboard.format
      });
    }
    setStep(4);
  }

  function openScoreboardForMatch(roundIndex, matchIndex) {
    if (!state.bracket) {
      openStandaloneBoard();
      return;
    }
    const match = state.bracket.rounds[roundIndex] && state.bracket.rounds[roundIndex][matchIndex];
    if (!match || match.bye || !match.a || !match.b) {
      toast("양 팀이 정해진 경기만 점수판을 열 수 있습니다.", "warn");
      return;
    }
    const key = match.id;
    const prev = state.scoreboard.boards[key];
    state.scoreboard.boards[key] = emptyBoard({
      key,
      roundIndex,
      matchIndex,
      teamA: match.a,
      teamB: match.b,
      customA: prev && prev.customA ? prev.customA : "A팀",
      customB: prev && prev.customB ? prev.customB : "B팀",
      format: prev ? prev.format : state.scoreboard.format,
      firstServer: prev ? prev.firstServer : "a",
      points: prev ? prev.points.slice() : []
    });
    state.scoreboard.active = key;
    setStep(4);
  }

  function applyWinnerToBracket() {
    const board = currentBoard();
    const derived = deriveBoard(board);
    if (!derived.winner) {
      toast("아직 경기가 끝나지 않았습니다.", "warn");
      return;
    }
    if (board.key === "standalone" || board.roundIndex == null || !state.bracket) {
      toast("대진표 경기에서 점수판을 열면 승자를 반영할 수 있습니다.", "warn");
      return;
    }
    const match = state.bracket.rounds[board.roundIndex] && state.bracket.rounds[board.roundIndex][board.matchIndex];
    if (!match) {
      toast("연결된 대진 경기를 찾을 수 없습니다.", "warn");
      return;
    }
    const teamId = derived.winner === "a" ? board.teamA : board.teamB;
    if (teamId !== match.a && teamId !== match.b) {
      toast("연결된 팀을 찾을 수 없습니다.", "warn");
      return;
    }
    if (match.winner === teamId) {
      toast("이미 대진표에 반영되어 있습니다.");
      return;
    }
    pickWinner(board.roundIndex, board.matchIndex, teamId, true);
    toast("대진표에 승자를 반영했습니다.", "ok");
  }

  function matchScoreLabel(match) {
    const board = state.scoreboard.boards[match.id];
    if (!board || !board.points.length) return "점수판";
    const d = deriveBoard(board);
    if (d.winner) return "점수판 " + d.gamesA + "-" + d.gamesB;
    if (d.games.length) return "점수판 " + d.gamesA + "-" + d.gamesB + " · " + d.currentA + "-" + d.currentB;
    return "점수판 " + d.currentA + "-" + d.currentB;
  }

  function clearDownstream(fromRound, fromMatch) {
    for (let r = fromRound + 1; r < state.bracket.rounds.length; r++) {
      state.bracket.rounds[r].forEach((match) => {
        if (!match.bye) match.winner = null;
      });
    }
  }

  function propagateWinners() {
    const rounds = state.bracket.rounds;
    const playIn = !!state.bracket.playIn;
    if (playIn && rounds.length > 1) {
      rounds[0].forEach((match) => {
        const next = rounds[match.feedRound] && rounds[match.feedRound][match.feedMatch];
        if (!next || !match.feedSide) return;
        if (match.feedSide === "a" && !next.aFixed) next.a = match.winner;
        if (match.feedSide === "b" && !next.bFixed) next.b = match.winner;
        if (next.winner && next.winner !== next.a && next.winner !== next.b) next.winner = null;
      });
      for (let r = 1; r < rounds.length - 1; r++) {
        rounds[r].forEach((match, i) => {
          const next = rounds[r + 1][Math.floor(i / 2)];
          const side = i % 2 === 0 ? "a" : "b";
          next[side] = match.winner;
          if (next.winner && next.winner !== next.a && next.winner !== next.b) next.winner = null;
        });
      }
      return;
    }
    for (let r = 0; r < rounds.length - 1; r++) {
      rounds[r].forEach((match, i) => {
        const next = rounds[r + 1][Math.floor(i / 2)];
        const side = i % 2 === 0 ? "a" : "b";
        next[side] = match.winner;
        if (next.winner && next.winner !== next.a && next.winner !== next.b) {
          next.winner = null;
        }
      });
    }
  }

  function championId() {
    if (!state.bracket) return null;
    const last = state.bracket.rounds[state.bracket.rounds.length - 1];
    if (!last || !last[0]) return null;
    return last[0].winner;
  }

  function roundTitle(roundIndex) {
    if (!state.bracket) return "";
    const rounds = state.bracket.rounds;
    if (state.bracket.playIn && roundIndex === 0) return "1회전";
    const remaining = Math.pow(2, rounds.length - roundIndex);
    if (remaining <= 2) return "결승";
    if (remaining === 4) return "준결승";
    return remaining + "강";
  }

  function memberChip(name, options) {
    const opts = options || {};
    const selected = state.selected === name ? " is-selected" : "";
    const extra = isClass(name) ? " is-class" : " is-extra";
    const draggable = opts.draggable ? "true" : "false";
    const remove = opts.removable
      ? '<button type="button" class="chip-x" data-remove="' + escapeHtml(name) + '" aria-label="삭제">×</button>'
      : "";
    return (
      '<span class="chip' + extra + selected + '" draggable="' + draggable + '" data-name="' + escapeHtml(name) + '">' +
      '<span class="num">' + classNumber(name) + "</span>" +
      '<span>' + escapeHtml(name) + "</span>" +
      remove +
      "</span>"
    );
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderStats() {
    const members = allMembers();
    const parts = [
      stat("참가", members.length + "명"),
      stat("팀", state.teams.length + "개")
    ];
    if (state.unused.length) parts.push(stat("미배정", state.unused.length + "명"));
    document.getElementById("stats").innerHTML = parts.join("");
  }

  function stat(label, value) {
    return '<span class="stat">' + label + " <b>" + value + "</b></span>";
  }

  function renderNav() {
    document.querySelectorAll(".step-btn").forEach((btn) => {
      const n = Number(btn.dataset.step);
      btn.classList.toggle("is-active", n === state.step);
      btn.classList.toggle("is-done", n < state.step);
    });
    document.querySelectorAll(".panel").forEach((panel) => {
      panel.classList.toggle("is-visible", Number(panel.dataset.panel) === state.step);
    });
  }

  function renderMembers() {
    document.getElementById("class-count").textContent = CLASS_MEMBERS.length + "명";
    document.getElementById("class-list").innerHTML = CLASS_MEMBERS.map((n) => memberChip(n)).join("");
    document.getElementById("extra-count").textContent = state.extras.length + "명";
    document.getElementById("extra-list").innerHTML = state.extras.map((n) => memberChip(n, { removable: true })).join("");
    document.getElementById("extra-empty").classList.toggle("hidden", state.extras.length > 0);
  }

  function renderTeams() {
    const banner = document.getElementById("team-banner");

    if (!state.teams.length) {
      banner.textContent = "";
      banner.className = "banner hidden";
    } else if (state.unused.length) {
      banner.textContent = "미배정 " + state.unused.length + "명. 팀에 넣거나 1인 팀으로 만드세요.";
      banner.className = "banner warn";
    } else {
      banner.textContent = "";
      banner.className = "banner hidden";
    }

    const genBtn = document.getElementById("gen-teams-btn");
    genBtn.textContent = state.teams.length ? "팀 다시 섞기" : "팀 만들기";
    const soloBtn = document.getElementById("solo-leftover-btn");
    soloBtn.disabled = state.unused.length === 0;
    soloBtn.classList.toggle("hidden", !state.teams.length || state.unused.length === 0);
    document.getElementById("unused-card").classList.toggle("hidden", !state.teams.length);

    document.getElementById("team-board").innerHTML = state.teams.map((team) => {
      return (
        '<article class="team-card" data-team="' + team.id + '">' +
        '<input class="team-name" data-rename="' + team.id + '" value="' + escapeHtml(team.name) + '" maxlength="20" />' +
        '<div class="team-members drop-zone" data-drop="' + team.id + '">' +
        team.members.map((n) => memberChip(n, { draggable: true })).join("") +
        (team.members.length ? "" : '<span class="hint">클릭해서 넣기</span>') +
        "</div>" +
        '<div class="team-meta">' + team.members.length + " / " + MAX_TEAM + "명</div>" +
        "</article>"
      );
    }).join("");

    document.getElementById("unused-count").textContent = state.unused.length + "명";
    document.getElementById("unused-list").innerHTML = state.unused.map((n) => memberChip(n, { draggable: true })).join("");
    document.getElementById("unused-empty").classList.toggle("hidden", state.unused.length > 0);
  }

  function slotHtml(teamId, match, roundIndex, matchIndex) {
    if (!teamId) {
      const waitingPlayIn = state.bracket && state.bracket.playIn && roundIndex === 1;
      const label = match.bye ? "부전승" : waitingPlayIn ? "1회전 승자" : "미정";
      return '<button type="button" class="slot is-bye" disabled>' + label + "</button>";
    }
    const team = teamById(teamId);
    if (!team) {
      return '<button type="button" class="slot is-bye" disabled>미정</button>';
    }
    const winner = match.winner === teamId ? " is-winner" : "";
    const members = team.members.join(", ");
    const disabled = match.bye || !match.a || !match.b ? " disabled" : "";
    return (
      '<button type="button" class="slot' + winner + '"' + disabled +
      ' data-win-round="' + roundIndex + '" data-win-match="' + matchIndex + '" data-win-team="' + team.id + '">' +
      escapeHtml(team.name) +
      '<small>' + escapeHtml(members) + "</small>" +
      "</button>"
    );
  }

  function renderBracket() {
    const empty = document.getElementById("bracket-empty");
    const champ = document.getElementById("champion");
    const banner = document.getElementById("bracket-banner");
    const root = document.getElementById("bracket");

    document.getElementById("reset-winners-btn").disabled = !state.bracket;
    document.getElementById("print-btn").disabled = !state.bracket;
    document.getElementById("gen-bracket-btn").disabled = state.teams.length < 2;
    document.getElementById("gen-bracket-btn").textContent = state.bracket ? "대진 다시 섞기" : "대진표 만들기";

    if (state.teams.length < 2) {
      banner.textContent = "팀이 2개 이상일 때 대진표를 만들 수 있습니다.";
      banner.className = "banner warn";
    } else if (!state.bracket) {
      banner.textContent = "";
      banner.className = "banner hidden";
    } else {
      banner.textContent = "";
      banner.className = "banner hidden";
    }

    if (!state.bracket) {
      root.innerHTML = "";
      empty.classList.remove("hidden");
      champ.classList.add("hidden");
      return;
    }

    empty.classList.add("hidden");
    const rounds = state.bracket.rounds;
    root.innerHTML = rounds.map((round, ri) => {
      return (
        '<div class="round">' +
        '<h3 class="round-title">' + roundTitle(ri) + "</h3>" +
        round.map((match, mi) => {
          const canBoard = !match.bye && match.a && match.b;
          const hasScore = canBoard && state.scoreboard.boards[match.id] && state.scoreboard.boards[match.id].points.length;
          return (
            '<div class="match">' +
            slotHtml(match.a, match, ri, mi) +
            slotHtml(match.b, match, ri, mi) +
            (canBoard
              ? '<button type="button" class="match-sb-btn' + (hasScore ? " has-score" : "") + '"' +
                ' data-sb-open-round="' + ri + '" data-sb-open-match="' + mi + '">' +
                matchScoreLabel(match) +
                "</button>"
              : "") +
            "</div>"
          );
        }).join("") +
        "</div>"
      );
    }).join("");

    const cid = championId();
    const team = cid ? teamById(cid) : null;
    if (team) {
      champ.classList.remove("hidden");
      champ.innerHTML = "우승<br /><strong>" + escapeHtml(team.name) + "</strong>";
    } else {
      champ.classList.add("hidden");
      champ.innerHTML = "";
    }
  }

  function teamOptions(selectedId, lockedId) {
    return state.teams.map((team) => {
      const selected = team.id === selectedId ? " selected" : "";
      const disabled = team.id === lockedId ? " disabled" : "";
      return '<option value="' + escapeHtml(team.id) + '"' + selected + disabled + ">" +
        escapeHtml(team.name) + "</option>";
    }).join("");
  }

  function renderSide(board, derived, side) {
    const info = boardSideInfo(board, side);
    const serving = !derived.winner && currentServer(board, derived) === side;
    const won = derived.winner === side;
    const score = side === "a" ? derived.currentA : derived.currentB;
    const gamesWon = side === "a" ? derived.gamesA : derived.gamesB;
    const dots = Array.from({ length: derived.need }, (_, i) => {
      return '<span class="sb-dot' + (i < gamesWon ? " is-on" : "") + '"></span>';
    }).join("");
    const members = info.members.length ? info.members.join(", ") : "";
    return (
      '<article class="sb-side' + (serving ? " is-serving" : "") + (won ? " is-winner" : "") + '">' +
      '<span class="sb-serve">' + (won ? "승리" : serving ? "서브" : "대기") + "</span>" +
      '<h3 class="sb-team-name">' + escapeHtml(info.name) + "</h3>" +
      (members ? '<div class="sb-members">' + escapeHtml(members) + "</div>" : "") +
      '<div class="sb-score">' + score + "</div>" +
      '<div class="sb-games" aria-label="게임 스코어">' + dots + "</div>" +
      '<div class="sb-btns">' +
      '<button type="button" class="sb-btn sb-btn-minus" data-sb-minus="' + side + '" aria-label="1점 빼기">−1</button>' +
      '<button type="button" class="sb-btn sb-btn-plus" data-sb-plus="' + side + '" aria-label="1점 더하기"' +
      (derived.winner ? " disabled" : "") + ">+1</button>" +
      "</div>" +
      "</article>"
    );
  }

  function renderScoreboard() {
    const board = currentBoard();
    const derived = deriveBoard(board);
    const linked = board.key !== "standalone" && board.roundIndex != null && state.bracket;
    const banner = document.getElementById("sb-banner");
    const setup = document.getElementById("sb-setup");
    const root = document.getElementById("sb-board");
    const applyBtn = document.getElementById("sb-apply-winner");
    const formatEl = document.getElementById("sb-format");

    formatEl.value = String(board.format === 5 ? 5 : 3);

    if (derived.winner) {
      banner.textContent = boardSideInfo(board, derived.winner).name + " 승리! " +
        derived.gamesA + " : " + derived.gamesB +
        (linked ? " 대진표에 승자를 반영할 수 있습니다." : "");
      banner.className = "banner ok";
    } else if (linked) {
      const title = roundTitle(board.roundIndex);
      banner.textContent = "대진표 " + title + " 경기. 점수는 이 기기에 저장됩니다.";
      banner.className = "banner";
    } else {
      banner.textContent = "자유 경기입니다. 팀을 고르거나 이름을 입력하세요.";
      banner.className = "banner";
    }

    if (linked) {
      const a = boardSideInfo(board, "a");
      const b = boardSideInfo(board, "b");
      const title = roundTitle(board.roundIndex);
      setup.innerHTML =
        '<div class="sb-linked"><span>대진표 · ' + escapeHtml(title) + "</span><span>연결됨</span></div>" +
        '<div class="sb-setup-grid">' +
        '<div class="sb-setup-side"><label>왼쪽</label><div class="sb-linked-name">' +
        escapeHtml(a.name) + "</div></div>" +
        '<div class="sb-setup-vs">VS</div>' +
        '<div class="sb-setup-side"><label>오른쪽</label><div class="sb-linked-name">' +
        escapeHtml(b.name) + "</div></div>" +
        "</div>";
    } else {
      const customA = !board.teamA;
      const customB = !board.teamB;
      setup.innerHTML =
        '<div class="sb-setup-grid">' +
        '<div class="sb-setup-side">' +
        '<label for="sb-team-a">왼쪽 팀</label>' +
        '<select id="sb-team-a" data-sb-team="a">' +
        '<option value="">이름 직접 입력</option>' +
        teamOptions(board.teamA, board.teamB) +
        "</select>" +
        '<input id="sb-custom-a" data-sb-custom="a" maxlength="20" placeholder="왼쪽 이름" value="' +
        escapeHtml(board.customA) + '"' + (customA ? "" : " class=\"hidden\"") + " />" +
        "</div>" +
        '<div class="sb-setup-vs">VS</div>' +
        '<div class="sb-setup-side">' +
        '<label for="sb-team-b">오른쪽 팀</label>' +
        '<select id="sb-team-b" data-sb-team="b">' +
        '<option value="">이름 직접 입력</option>' +
        teamOptions(board.teamB, board.teamA) +
        "</select>" +
        '<input id="sb-custom-b" data-sb-custom="b" maxlength="20" placeholder="오른쪽 이름" value="' +
        escapeHtml(board.customB) + '"' + (customB ? "" : " class=\"hidden\"") + " />" +
        "</div>" +
        "</div>";
    }

    let status = (derived.gameIndex + 1) + "게임";
    let statusClass = "sb-status";
    if (derived.winner) {
      status = "경기 종료";
      statusClass += " is-done";
    } else if (derived.deuce) {
      status = "듀스";
      statusClass += " is-deuce";
    }

    const history = derived.games.map((g, i) => (i + 1) + "게임 " + g.a + "-" + g.b).join(" · ");
    const inPlay = !derived.winner && (derived.games.length > 0 || derived.currentA > 0 || derived.currentB > 0);
    const live = inPlay ? ((history ? " · " : "") + "진행 " + derived.currentA + "-" + derived.currentB) : "";

    root.innerHTML =
      '<div class="scoreboard">' +
      renderSide(board, derived, "a") +
      '<div class="sb-mid"><div class="sb-vs">VS</div><div class="' + statusClass + '">' + status + "</div></div>" +
      renderSide(board, derived, "b") +
      "</div>" +
      '<p class="sb-history">게임 스코어 <b>' + derived.gamesA + " : " + derived.gamesB + "</b>" +
      (history || live ? " · " + history + live : " · 아직 점수가 없습니다.") +
      "</p>";

    applyBtn.disabled = !derived.winner || !linked;
  }

  function render() {
    renderNav();
    renderStats();
    renderMembers();
    renderTeams();
    renderBracket();
    renderScoreboard();
  }

  function bind() {
    document.querySelectorAll(".step-btn, [data-goto]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const n = Number(btn.dataset.step || btn.dataset.goto);
        if (n) setStep(n);
      });
    });

    document.getElementById("extra-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("extra-name");
      addExtra(input.value);
      input.value = "";
      input.focus();
    });

    document.body.addEventListener("click", (e) => {
      const remove = e.target.closest("[data-remove]");
      if (remove) {
        removeExtra(remove.dataset.remove);
        return;
      }
      const sbOpen = e.target.closest("[data-sb-open-round]");
      if (sbOpen) {
        openScoreboardForMatch(Number(sbOpen.dataset.sbOpenRound), Number(sbOpen.dataset.sbOpenMatch));
        return;
      }
      const sbPlus = e.target.closest("[data-sb-plus]");
      if (sbPlus) {
        addPoint(sbPlus.dataset.sbPlus);
        return;
      }
      const sbMinus = e.target.closest("[data-sb-minus]");
      if (sbMinus) {
        minusPoint(sbMinus.dataset.sbMinus);
        return;
      }
      const win = e.target.closest("[data-win-team]");
      if (win) {
        pickWinner(Number(win.dataset.winRound), Number(win.dataset.winMatch), win.dataset.winTeam);
        return;
      }
      const teamCard = e.target.closest("[data-team]");
      if (teamCard && state.selected && !e.target.closest("[data-name]") && !e.target.closest(".team-name")) {
        onTeamClick(teamCard.dataset.team);
        return;
      }
      const unused = e.target.closest("[data-drop='unused']");
      if (unused && state.selected && !e.target.closest("[data-name]") && !e.target.closest("h3, .pill, .hint")) {
        moveMember(state.selected, "unused");
        return;
      }
      const chip = e.target.closest("[data-name]");
      if (chip && state.step === 2 && !e.target.closest("[data-remove]")) {
        onMemberClick(chip.dataset.name);
      }
    });

    document.body.addEventListener("change", (e) => {
      if (e.target.matches("[data-rename]")) {
        renameTeam(e.target.dataset.rename, e.target.value);
      }
      if (e.target.matches("[data-sb-team]")) {
        setBoardTeam(e.target.dataset.sbTeam, e.target.value);
      }
      if (e.target.matches("[data-sb-custom]")) {
        setBoardCustom(e.target.dataset.sbCustom, e.target.value);
      }
    });

    document.body.addEventListener("dragstart", (e) => {
      const chip = e.target.closest("[data-name]");
      if (!chip || chip.getAttribute("draggable") !== "true") return;
      dragName = chip.dataset.name;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", dragName);
    });

    document.body.addEventListener("dragend", () => {
      dragName = null;
      document.querySelectorAll(".is-drop").forEach((el) => el.classList.remove("is-drop"));
    });

    document.body.addEventListener("dragover", (e) => {
      const zone = e.target.closest("[data-drop], [data-team]");
      if (!zone || !dragName) return;
      e.preventDefault();
      zone.classList.add("is-drop");
    });

    document.body.addEventListener("dragleave", (e) => {
      const zone = e.target.closest("[data-drop], [data-team]");
      if (zone) zone.classList.remove("is-drop");
    });

    document.body.addEventListener("drop", (e) => {
      const zone = e.target.closest("[data-drop], [data-team]");
      if (!zone) return;
      e.preventDefault();
      const name = dragName || e.dataTransfer.getData("text/plain");
      const target = zone.dataset.drop || zone.dataset.team;
      if (name && target) moveMember(name, target);
    });

    document.getElementById("gen-teams-btn").addEventListener("click", generateTeams);
    document.getElementById("solo-leftover-btn").addEventListener("click", promoteLeftovers);
    document.getElementById("gen-bracket-btn").addEventListener("click", () => buildBracket());
    document.getElementById("reset-winners-btn").addEventListener("click", resetWinners);
    document.getElementById("print-btn").addEventListener("click", () => {
      setStep(3);
      window.print();
    });
    document.getElementById("open-scoreboard-btn").addEventListener("click", () => setStep(4));
    document.getElementById("sb-format").addEventListener("change", (e) => {
      setBoardFormat(Number(e.target.value));
    });
    document.getElementById("sb-swap-serve").addEventListener("click", swapFirstServer);
    document.getElementById("sb-undo").addEventListener("click", undoPoint);
    document.getElementById("sb-reset").addEventListener("click", resetScoreboard);
    document.getElementById("sb-standalone-btn").addEventListener("click", openStandaloneBoard);
    document.getElementById("sb-apply-winner").addEventListener("click", applyWinnerToBracket);

    document.addEventListener("keydown", (e) => {
      if (state.step !== 4) return;
      if (e.target.closest("input, select, textarea")) return;
      const key = e.key;
      if (key === "a" || key === "A" || key === "ArrowLeft" || key === "1") {
        e.preventDefault();
        addPoint("a");
      } else if (key === "d" || key === "D" || key === "ArrowRight" || key === "2") {
        e.preventDefault();
        addPoint("b");
      } else if (key === "z" || key === "Z") {
        e.preventDefault();
        minusPoint("a");
      } else if (key === "c" || key === "C") {
        e.preventDefault();
        minusPoint("b");
      } else if (key === "Backspace" || key === "u" || key === "U") {
        e.preventDefault();
        undoPoint();
      }
    });

    window.addEventListener("beforeprint", () => {
      state.step = 3;
      render();
    });
  }

  load();
  save();
  bind();
  render();
})();
