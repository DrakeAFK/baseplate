<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/baseplate.svg';
	import AppShell from '$lib/components/app-shell/AppShell.svelte';

	let { data, children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Baseplate</title>
</svelte:head>

<AppShell shell={data.shell}>
	{@render children()}
</AppShell>
