<template>
  <main class="shell">
    <header class="top">
      <NuxtLink class="brand" to="/"><strong>GatheredHub</strong></NuxtLink>
      <p v-if="session" class="muted">{{ session.name }} · this browser remembers you</p>
    </header>

    <p v-if="!ready">Opening your hub…</p>
    <p v-else-if="error" class="error">{{ error }}</p>

    <section v-else-if="!session" class="grid two">
      <div>
        <p class="kicker">Several days, one place</p>
        <h1>Plan the gathering before anyone packs a bag.</h1>
        <p>
          GatheredHub keeps who is coming, where they are staying, and the calendar for each event.
          Guests open an email invite once. After that, this browser lets them back in.
        </p>
      </div>
      <form class="card form" style="padding: 18px" @submit.prevent="start">
        <h2>Organize a gathering</h2>
        <label>Your name <input v-model="name" required autocomplete="name" /></label>
        <label>Email <input v-model="email" type="email" required autocomplete="email" /></label>
        <button class="btn terra" type="submit">Continue</button>
      </form>
    </section>

    <section v-else>
      <div class="when">
        <div>
          <p class="kicker">Your gatherings</p>
          <h1>Who’s coming, and what’s planned.</h1>
        </div>
        <button v-if="session.kind === 'organizer'" class="btn" type="button" @click="showForm = !showForm">
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
      <p v-if="!myEvents().length" class="muted">No gatherings yet.</p>
      <div v-else class="list">
        <NuxtLink v-for="event in myEvents()" :key="event.id" class="card event-link" :to="`/events/${event.id}`">
          <strong>{{ event.name }}</strong>
          <p class="muted">{{ formatDay(event.start) }} – {{ formatDay(event.end) }} · {{ event.place }}</p>
          <p>{{ comingCount(event.id) }} coming</p>
        </NuxtLink>
      </div>
    </section>
  </main>
</template>

<script setup>
const hub = useHub();
const { session, ready, error, mode, enterAsOrganizer, createEvent, myEvents, peopleFor, formatDay } = hub;
const name = ref("");
const email = ref("");
const showForm = ref(false);
const formError = ref("");
const draft = reactive({ name: "", place: "", start: "", end: "", notes: "" });

function start() {
  enterAsOrganizer(name.value, email.value);
  showForm.value = true;
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
  const event = await createEvent(draft);
  await navigateTo(`/events/${event.id}`);
}
</script>
