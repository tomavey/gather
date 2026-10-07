const SESSION_KEY = "gathered-hub-session";
const LOCAL_KEY = "gathered-hub-db";

function emptyState() {
  return { events: [], people: [], items: [], updates: [], invites: [] };
}

function uid() {
  if (import.meta.client && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function eachDay(start, end) {
  const days = [];
  if (!start || !end) return days;
  const cursor = new Date(`${start}T12:00:00`);
  const last = new Date(`${end}T12:00:00`);
  while (cursor <= last && days.length < 62) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function formatDay(iso) {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

let boot;

export function useHub() {
  const config = useRuntimeConfig();
  const state = useState("gh-state", emptyState);
  const session = useState("gh-session", () => null);
  const ready = useState("gh-ready", () => false);
  const mode = useState("gh-mode", () => "local");
  const error = useState("gh-error", () => "");
  const services = useState("gh-services", () => null);

  function readLocal() {
    try {
      return { ...emptyState(), ...JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}") };
    } catch {
      return emptyState();
    }
  }

  function writeLocal() {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state.value));
  }

  function readSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  }

  function writeSession(next) {
    session.value = next;
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  }

  function logChange(eventId, summary) {
    const entry = {
      id: uid(),
      eventId,
      summary,
      actor: session.value?.name || "Someone",
      createdAt: Date.now(),
    };
    state.value.updates.unshift(entry);
    if (mode.value !== "firebase") writeLocal();
    return entry;
  }

  async function put(collection, record) {
    const list = state.value[collection];
    const index = list.findIndex((item) => item.id === record.id);
    if (index === -1) list.push(record);
    else list[index] = record;
    if (mode.value === "firebase" && services.value) {
      const { doc, setDoc } = await import("firebase/firestore");
      await setDoc(doc(services.value.db, collection, record.id), record);
    } else {
      writeLocal();
    }
  }

  async function remove(collection, id) {
    state.value[collection] = state.value[collection].filter((item) => item.id !== id);
    if (mode.value === "firebase" && services.value) {
      const { doc, deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(services.value.db, collection, id));
    } else {
      writeLocal();
    }
  }

  async function init() {
    if (!import.meta.client) return;
    session.value = readSession();
    const pub = config.public;
    if (pub.firebaseApiKey && pub.firebaseProjectId) {
      await initFirebase(pub);
    } else {
      mode.value = "local";
      state.value = readLocal();
      ready.value = true;
    }
  }

  async function initFirebase(pub) {
    const { initializeApp } = await import("firebase/app");
    const { getAuth, setPersistence, browserLocalPersistence, onAuthStateChanged } =
      await import("firebase/auth");
    const { getFirestore, collection, onSnapshot } = await import("firebase/firestore");
    const { getStorage } = await import("firebase/storage");
    const app = initializeApp({
      apiKey: pub.firebaseApiKey,
      authDomain: pub.firebaseAuthDomain,
      projectId: pub.firebaseProjectId,
      storageBucket: pub.firebaseStorageBucket,
      messagingSenderId: pub.firebaseMessagingSenderId,
      appId: pub.firebaseAppId,
      measurementId: pub.firebaseMeasurementId,
    });
    if (pub.firebaseMeasurementId) {
      const { getAnalytics, isSupported } = await import("firebase/analytics");
      if (await isSupported()) getAnalytics(app);
    }
    const auth = getAuth(app);
    await setPersistence(auth, browserLocalPersistence);
    const db = getFirestore(app);
    const storage = getStorage(app);
    services.value = { auth, db, storage };
    mode.value = "firebase";
    for (const name of ["events", "people", "items", "updates", "invites"]) {
      onSnapshot(
        collection(db, name),
        (snap) => {
          state.value[name] = snap.docs.map((entry) => entry.data());
          if (name === "updates") {
            state.value.updates.sort((a, b) => b.createdAt - a.createdAt);
          }
          ready.value = true;
        },
        () => {
          ready.value = true;
        },
      );
    }
    onAuthStateChanged(auth, (user) => {
      if (!user?.email) return;
      const current = readSession();
      if (!current || current.email !== user.email) {
        writeSession({
          name: current?.name || user.email.split("@")[0],
          email: user.email,
          kind: current?.kind || "guest",
        });
      }
    });
  }

  function ensure() {
    if (!import.meta.client) return Promise.resolve();
    if (!boot) boot = init().catch((cause) => {
      error.value = cause.message || "Could not open the hub.";
      mode.value = "local";
      state.value = readLocal();
      ready.value = true;
    });
    return boot;
  }

  function myEvents() {
    if (!session.value) return [];
    const email = session.value.email.toLowerCase();
    const ids = new Set(
      state.value.people
        .filter((person) => person.email.toLowerCase() === email)
        .map((person) => person.eventId),
    );
    return state.value.events
      .filter((event) => ids.has(event.id) || event.organizerEmail.toLowerCase() === email)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  function eventById(id) {
    return state.value.events.find((event) => event.id === id) || null;
  }

  function peopleFor(eventId) {
    return state.value.people
      .filter((person) => person.eventId === eventId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function itemsFor(eventId) {
    return state.value.items
      .filter((item) => item.eventId === eventId)
      .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`));
  }

  function updatesFor(eventId) {
    return state.value.updates.filter((entry) => entry.eventId === eventId);
  }

  function isOrganizer(event) {
    return !!event && session.value?.email?.toLowerCase() === event.organizerEmail.toLowerCase();
  }

  async function enterAsOrganizer(name, email) {
    writeSession({ name: name.trim(), email: email.trim().toLowerCase(), kind: "organizer" });
  }

  async function createEvent(input) {
    const event = {
      id: uid(),
      name: input.name.trim(),
      place: input.place.trim(),
      start: input.start,
      end: input.end,
      notes: input.notes.trim(),
      coverUrl: "",
      organizerEmail: session.value.email,
      organizerName: session.value.name,
      createdAt: Date.now(),
    };
    state.value.events.push(event);
    const person = {
      id: uid(),
      eventId: event.id,
      name: session.value.name,
      email: session.value.email,
      status: "coming",
      arrival: event.start,
      departure: event.end,
      lodging: "",
    };
    state.value.people.push(person);
    const entry = logChange(event.id, `${session.value.name} opened ${event.name}.`);
    if (mode.value === "local") writeLocal();
    else {
      await put("events", event);
      await put("people", person);
      await put("updates", entry);
    }
    return event;
  }

  async function savePerson(person, summary) {
    await put("people", { ...person });
    if (summary) {
      const entry = logChange(person.eventId, summary);
      if (mode.value === "firebase") await put("updates", entry);
    }
  }

  async function saveItem(item, summary) {
    await put("items", { ...item });
    if (summary) {
      const entry = logChange(item.eventId, summary);
      if (mode.value === "firebase") await put("updates", entry);
    }
  }

  async function deleteItem(item) {
    const entry = logChange(item.eventId, `${session.value.name} removed “${item.title}” from the calendar.`);
    await remove("items", item.id);
    if (mode.value === "firebase") await put("updates", entry);
  }

  async function invite(event, email) {
    const clean = email.trim().toLowerCase();
    const existing = state.value.invites.find(
      (item) => item.eventId === event.id && item.email === clean,
    );
    const invite = existing || {
      id: uid(),
      eventId: event.id,
      email: clean,
      token: uid(),
      createdAt: Date.now(),
    };
    await put("invites", invite);
    const entry = logChange(event.id, `${session.value.name} invited ${clean}.`);
    if (mode.value === "firebase") await put("updates", entry);
    if (mode.value === "firebase" && services.value) {
      try {
        const { sendSignInLinkToEmail } = await import("firebase/auth");
        const url = `${location.origin}/join/${invite.token}`;
        await sendSignInLinkToEmail(services.value.auth, clean, {
          url,
          handleCodeInApp: true,
        });
        localStorage.setItem("gathered-hub-email", clean);
      } catch (cause) {
        error.value = cause.message || "Firebase could not send the email. The invite link still works.";
      }
    }
    return invite;
  }

  async function acceptInvite(token, name) {
    const invite = state.value.invites.find((item) => item.token === token);
    if (!invite) return null;
    const event = eventById(invite.eventId);
    if (!event) return null;
    if (mode.value === "firebase" && services.value) {
      const { isSignInWithEmailLink, signInWithEmailLink } = await import("firebase/auth");
      if (isSignInWithEmailLink(services.value.auth, location.href)) {
        const email = localStorage.getItem("gathered-hub-email") || invite.email;
        await signInWithEmailLink(services.value.auth, email, location.href);
      }
    }
    writeSession({ name: name.trim(), email: invite.email, kind: "guest" });
    let person = state.value.people.find(
      (item) => item.eventId === event.id && item.email === invite.email,
    );
    if (!person) {
      person = {
        id: uid(),
        eventId: event.id,
        name: name.trim(),
        email: invite.email,
        status: "coming",
        arrival: event.start,
        departure: event.end,
        lodging: "",
      };
      await put("people", person);
      const entry = logChange(event.id, `${person.name} joined ${event.name}.`);
      if (mode.value === "firebase") await put("updates", entry);
    } else if (person.name !== name.trim()) {
      person.name = name.trim();
      await put("people", person);
    }
    return event;
  }

  async function saveCover(event, file) {
    let coverUrl = "";
    if (mode.value === "firebase" && services.value) {
      const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
      const stored = ref(services.value.storage, `events/${event.id}/cover-${uid()}`);
      await uploadBytes(stored, file);
      coverUrl = await getDownloadURL(stored);
    } else {
      coverUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
    }
    await put("events", { ...event, coverUrl });
    const entry = logChange(event.id, `${session.value.name} updated the gathering photo.`);
    if (mode.value === "firebase") await put("updates", entry);
  }

  return {
    state,
    session,
    ready,
    mode,
    error,
    ensure,
    myEvents,
    eventById,
    peopleFor,
    itemsFor,
    updatesFor,
    isOrganizer,
    enterAsOrganizer,
    createEvent,
    savePerson,
    saveItem,
    deleteItem,
    invite,
    acceptInvite,
    saveCover,
    eachDay,
    formatDay,
    uid,
  };
}
