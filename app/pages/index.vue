<template>
  <main class="shell">
    <header class="top">
      <NuxtLink class="brand" to="/"><strong>GatheredHub</strong></NuxtLink>
      <p v-if="session" class="muted">{{ session.name }} · {{ session.email }}</p>
      <button v-if="!isSuperadmin()" class="btn secondary" type="button" @click="showAdmin = !showAdmin">Superadmin</button>
    </header>

    <p class="today">{{ today }}</p>

    <form v-if="showAdmin && ready && !isSuperadmin()" class="card form" style="padding: 18px; margin-bottom: 16px" @submit.prevent="onSuperadmin">
      <h2>Superadmin</h2>
      <label>Email <input v-model="adminEmail" type="email" required autocomplete="username" /></label>
      <PasswordField v-model="adminPassword" label="Password" autocomplete="current-password" required minlength="6" />
      <p v-if="adminError" class="error">{{ adminError }}</p>
      <p class="muted">The first sign-in sets the password. After that, this account can open every gathering and edit every user.</p>
      <button class="btn" type="submit">Sign in as superadmin</button>
    </form>

    <p v-if="!ready">Opening your hub…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <section v-else-if="!session" class="grid two">
      <div>
        <p class="kicker">Several days, one place</p>
        <h1>Plan the gathering before anyone packs a bag.</h1>
        <p>
          GatheredHub keeps who is coming, where they are staying, and the calendar for each event.
          Guests choose a password when they accept an invite, then sign in on any device.
        </p>
      </div>
      <div class="list">
        <form class="card form" style="padding: 18px" @submit.prevent="start">
          <h2>Organize a gathering</h2>
          <label>Your name <input v-model="name" required autocomplete="name" /></label>
          <label>Email <input v-model="email" type="email" required autocomplete="email" /></label>
          <button class="btn terra" type="submit">Continue</button>
        </form>
        <form class="card form" style="padding: 18px" @submit.prevent="onSignIn">
          <h2>Sign in</h2>
          <label>Email <input v-model="signInEmail" type="email" required autocomplete="username" /></label>
          <PasswordField v-model="signInPassword" label="Password" autocomplete="current-password" required minlength="6" />
          <p v-if="signInError" class="error">{{ signInError }}</p>
          <button class="btn" type="submit">Sign in</button>
        </form>
      </div>
    </section>

    <section v-else>
      <div class="when">
        <div>
          <p class="kicker">{{ isSuperadmin() ? "Every gathering" : "Your gatherings" }}</p>
          <h1>{{ isSuperadmin() ? "All gatherings and users." : "Who’s coming, and what’s planned." }}</h1>
        </div>
        <button v-if="session.kind === 'organizer' || isSuperadmin()" class="btn" type="button" @click="showForm = !showForm">
          {{ showForm ? "Close" : "New event" }}
        </button>
      </div>
      <p v-if="mode === 'local'" class="banner">
        Saving on this browser.. Add Firebase keys when you want every guest to share the same hub.
      </p>
      <form v-if="showForm" class="card form" style="padding: 18px; margin-bottom: 16px" @submit.prevent="onCreate">
        <label>Event name <input v-model="draft.name" required placeholder="Lake weekend" /></label>
        <label>Where <input v-model="draft.place" required placeholder="250 Betsy Run, Longwood" /></label>
        <div class="row">
          <label class="grow">First day <input v-model="draft.start" type="date" required /></label>
          <label class="grow">Last day <input v-model="draft.end" type="date" required /></label>
        </div>
        <label>Note <textarea v-model="draft.notes" placeholder="House notes, arrival window, what to bring." /></label>
        <p v-if="formError" class="error">{{ formError }}</p>
        <button class="btn terra" type="submit">Create event</button>
      </form>
      <p v-if="!eventsToShow().length" class="muted">No gatherings yet.</p>
      <div v-else class="list">
        <NuxtLink v-for="event in eventsToShow()" :key="event.id" class="card event-link" :to="`/events/${event.id}`">
          <strong>{{ event.name }}</strong>
          <p class="muted">{{ formatDay(event.start) }} – {{ formatDay(event.end) }} · {{ event.place }}</p>
          <p>{{ comingCount(event.id) }} coming</p>
        </NuxtLink>
      </div>

      <div v-if="isSuperadmin()" class="list" style="margin-top: 28px">
        <h2>Users</h2>
        <p v-if="!allUsers().length" class="muted">No users yet.</p>
        <form v-for="user in allUsers()" :key="user.email" class="card form" style="padding: 18px" @submit.prevent="onSaveUser(user.email)">
          <strong>{{ user.email }}</strong>
          <p v-if="user.events.length" class="muted">
            <template v-for="(event, index) in user.events" :key="event.id">
              <span v-if="index"> · </span>
              <NuxtLink :to="`/events/${event.id}`">{{ event.name }}</NuxtLink>
            </template>
          </p>
          <label>Name <input v-model="draftFor(user).name" required /></label>
          <label>Cell phone <input v-model="draftFor(user).phone" type="tel" /></label>
          <p v-if="userErrors[user.email]" class="error">{{ userErrors[user.email] }}</p>
          <button class="btn" type="submit">Save user</button>
        </form>
      </div>
    </section>
  </main>
</template>

<script setup>
const hub = useHub();
const { session, ready, error, mode, enterAsOrganizer, signIn, signInSuperadmin, isSuperadmin, allUsers, saveUser, createEvent, myEvents, allEvents, peopleFor, formatDay } = hub;
const today = new Date().toLocaleDateString(undefined, {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
});
const name = ref("");
const email = ref("");
const signInEmail = ref("");
const signInPassword = ref("");
const signInError = ref("");
const showAdmin = ref(false);
const adminEmail = ref("");
const adminPassword = ref("");
const adminError = ref("");
const showForm = ref(false);
const userDrafts = reactive({});
const userErrors = reactive({});

function draftFor(user) {
  if (!userDrafts[user.email]) userDrafts[user.email] = { name: user.name, phone: user.phone || "" };
  return userDrafts[user.email];
}
const formError = ref("");
const draft = reactive({ name: "", place: "", start: "", end: "", notes: "" });

async function start() {
  try {
    await enterAsOrganizer(name.value, email.value);
    showForm.value = true;
  } catch (cause) {
    error.value = cause.message || "Could not sign in to Firebase.";
  }
}

async function onSignIn() {
  signInError.value = "";
  try {
    await signIn(signInEmail.value, signInPassword.value);
  } catch (cause) {
    signInError.value = cause.message || "Could not sign in.";
  }
}

async function onSuperadmin() {
  adminError.value = "";
  try {
    await signInSuperadmin(adminEmail.value, adminPassword.value);
    showAdmin.value = false;
    adminPassword.value = "";
  } catch (cause) {
    adminError.value = cause.message || "Could not sign in as superadmin.";
  }
}

function eventsToShow() {
  return isSuperadmin() ? allEvents() : myEvents();
}

async function onSaveUser(email) {
  userErrors[email] = "";
  const draft = userDrafts[email];
  try {
    await saveUser(email, draft);
  } catch (cause) {
    userErrors[email] = cause.message || "Could not save that user.";
  }
}

function comingCount(eventId) {
  return peopleFor(eventId).filter((person) => person.status === "coming").length;
}

async function onCreate() {
  formError.value = "";
  if (draft.end < draft.start) {
    formError.value = "The last day has to be on or after the first day.";
    return;
  }
  try {
    const event = await createEvent(draft);
    await navigateTo(`/events/${event.id}`);
  } catch (cause) {
    formError.value = cause.message || "Could not save this gathering to Firebase.";
  }
}
</script>
