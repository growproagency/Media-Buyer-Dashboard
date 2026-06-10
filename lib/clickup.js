// Pulls lightweight account context from a ClickUp list: the list name plus a
// few open tasks (name + status) to give buyers context next to their numbers.
// Returns null when no token / list id is configured.

const API = "https://api.clickup.com/api/v2";

export async function getClickUpContext(listId) {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token || !listId) return null;

  const headers = { Authorization: token };

  try {
    const [listRes, tasksRes] = await Promise.all([
      fetch(`${API}/list/${listId}`, { headers, cache: "no-store" }),
      fetch(
        `${API}/list/${listId}/task?subtasks=false&include_closed=false&page=0`,
        { headers, cache: "no-store" }
      ),
    ]);

    const list = await listRes.json();
    if (list.err) return { error: list.err };
    const tasksJson = await tasksRes.json();

    const tasks = (tasksJson.tasks || []).slice(0, 4).map((t) => ({
      name: t.name,
      status: t.status?.status || "",
      url: t.url,
    }));

    return {
      listName: list.name || "ClickUp list",
      tasks,
      source: "clickup",
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}
