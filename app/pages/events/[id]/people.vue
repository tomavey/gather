<script setup>
const route = useRoute()

await navigateTo(`/events/${route.params.id}`, { replace: true })
</script>
