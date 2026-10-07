export default defineNuxtPlugin(() => {
  const hub = useHub();
  hub.ensure();
});
