<template>
  <main class="shell">
    <header class="top">
      <NuxtLink class="brand" to="/"><strong>GatheredHub</strong></NuxtLink>
    </header>
    <p v-if="!ready">Opening your invite…</p>
    <section v-else-if="!invite" class="card" style="padding: 18px">
      <h1>This invite is not on this hub.</h1>
      <p>Ask the organizer to send a new link.</p>
    </section>
    <section v-else class="grid two">
      <div>
        <p class="kicker">You’re invited</p>
        <h1>{{ event?.name }}</h1>
        <p>{{ formatDay(event?.start) }} – {{ formatDay(event?.end) }}</p>
        <p>{{ event?.place }}</p>
      </div>
      <form class="card form" style="padding: 18px" @submit.prevent="join">
        <label>Name <input v-model="name" required /></label>
        <label>Email <input :value="invite.email" disabled /></label>
        <p class="muted">We’ll remember you in this browser. You won’t sign in again on this device.</p>
        <button class="btn terra" type="submit">Enter the hub</button>
      </form>
    </section>
  </main>
</template>

<script setup>
const route = useRoute();
const hub = useHub();
const { ready, state, eventById, acceptInvite, formatDay } = hub;
const name = ref("");

const invite = computed(() =>
  state.value.invites.find((item) => item.token === route.params.token),
);
const event = computed(() => (invite.value ? eventById(invite.value.eventId) : null));

async function join() {
  const next = await acceptInvite(route.params.token, name.value);
  if (next) await navigateTo(`/events/${next.id}`);
}
</script>
