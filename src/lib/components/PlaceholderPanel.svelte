<script lang="ts">
	let { title }: { title: string } = $props();
</script>

<div
	class="flex h-48 items-center justify-center rounded border-2 border-dashed border-gray-700 bg-gray-900/50"
>
	<span class="text-sm text-gray-500">{title}</span>
</div>
