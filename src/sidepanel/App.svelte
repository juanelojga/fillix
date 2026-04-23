<script lang="ts">
  import { onMount, setContext } from 'svelte';
  import { Tabs, TabsList, TabsTrigger, TabsContent } from '$components/ui/tabs';
  import ChatTab from './tabs/ChatTab.svelte';
  import SettingsTab from './tabs/SettingsTab.svelte';
  import WorkflowTab from './tabs/WorkflowTab.svelte';

  let currentTab = $state('chat');

  const chatPort = chrome.runtime.connect({ name: 'chat' });
  const workflowPort = chrome.runtime.connect({ name: 'workflow' });
  setContext('chatPort', chatPort);
  setContext('workflowPort', workflowPort);

  onMount(() => {
    return () => {
      chatPort.disconnect();
      workflowPort.disconnect();
    };
  });
</script>

<Tabs bind:value={currentTab} class="h-full flex flex-col">
  <TabsList>
    <TabsTrigger value="chat">Chat</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
    <TabsTrigger value="workflow">Workflow</TabsTrigger>
  </TabsList>
  <TabsContent value="chat" class="flex-1 overflow-hidden"><ChatTab /></TabsContent>
  <TabsContent value="settings"><SettingsTab /></TabsContent>
  <TabsContent value="workflow"><WorkflowTab /></TabsContent>
</Tabs>
