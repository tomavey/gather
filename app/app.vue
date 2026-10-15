<template>
  <div v-if="session" class="edge-nav">
    <aside>
      <p class="muted">{{ session.name }}</p>
      <p class="muted">{{ session.email }}</p>
      <button class="btn secondary" type="button" @click="onLogout">Log out</button>
    </aside>
  </div>
  <NuxtPage />
</template>

<script setup>
const { session, logout } = useHub();

async function onLogout() {
  await logout();
}
</script>
