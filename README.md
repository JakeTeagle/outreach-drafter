# Outreach Drafter

**A Chrome add-on that writes personal LinkedIn Recruiter messages for you, based on your own hiring playbooks in Notion.**

You open a candidate's profile in LinkedIn Recruiter, click one button, and get two ready-to-send messages. Each one is written for that person and that role. You copy one and paste it into LinkedIn.

No coding needed. Setup takes about 15 minutes, once.

---

## What it does

1. **Reads the profile** you're looking at in LinkedIn Recruiter. It only reads the page when you click the button.
2. **Opens the right hiring playbook** from your Notion. You pick the role from a list.
3. **Writes two messages** with Claude (an AI assistant):
   - **"Their Work"** opens with something specific the person has done.
   - **"The Role"** opens with what makes the job worth their time.
4. **Shows you what to check** before sending. It also tells you which of the two it thinks is stronger.

Every message stays under 100 words, sounds human, and ends with a clear ask, like a 15-minute call this week. You can edit anything before you copy it.

---

## Before you start

You'll need these four things.

| What | Why | Cost |
| --- | --- | --- |
| **A Mac** | The small helper program that comes with it only runs on a Mac | |
| **Google Chrome** | The add-on lives in Chrome | Free |
| **Notion**, with your hiring playbooks in it | It's where the add-on gets each role's details | Free or paid |
| **An Anthropic (Claude) account** | It's the AI that writes the messages | Pay as you go, a few pence per message |

> **Hiring playbook?** That's just a Notion page per role: what the job is, what you're looking for, why someone would want it. If the page title has the word "playbook" in it, the add-on will find it.

---

## Setup (do this once)

### Step 1: Download it

1. At the top of this page, click the green **Code** button, then **Download ZIP**.
2. Open your **Downloads** folder and double-click the ZIP to unzip it.
3. Move the unzipped folder somewhere it can stay for good, such as your **Documents** folder.

> ⚠️ **Don't move or rename that folder later.** If you do, you'll need to redo Step 3.

### Step 2: Add it to Chrome

1. In Chrome, type `chrome://extensions` into the address bar and press **Enter**.
2. Turn on **Developer mode** with the switch in the top-right corner.
3. Click **Load unpacked** (top-left), select the folder from Step 1, and click **Select**.
4. Click the 🧩 puzzle-piece icon at the top-right of Chrome, then the 📌 pin next to **Outreach Drafter**, so it always shows.

### Step 3: Connect Notion

1. Click the Outreach Drafter icon. A panel opens on the right. Click the ⚙️ **gear** icon to open Settings.
2. Next to **Redirect URI**, click **Copy**.
3. In Notion, go to **Settings → Connections → Develop or manage integrations** (or **Developer tools → Connections**), then click **New connection**.
4. Fill it in:
   - **Connection name:** type anything, e.g. *Outreach Drafter*. The box looks filled in, but that's just grey example text, so you do need to type.
   - **Authentication method:** choose **OAuth**.
   - **Redirect URIs:** paste what you copied in Step 3.2.
   - Click **Create connection**.
5. Notion now shows a **Client ID** and a **Client secret**. Copy each one into the matching box in the add-on's Settings.
6. Click **Connect Notion**. A Notion window pops up. Choose the page that holds your hiring playbooks, then click **Allow**.
7. Settings should now say **Connected** in green ✅

> **Using a personal Notion where you're the admin?** You can instead create an **API token** connection and paste its token under **Advanced → Notion API token**. Then skip steps 5 and 6.

### Step 4: Connect Claude

1. Go to [console.anthropic.com](https://console.anthropic.com), sign in, open **API Keys**, and click **Create Key**. Copy the key.
2. In the add-on's Settings, paste it into **API key**.
3. Type your first name into **Sign-off name**. It's used to sign your messages.
4. Click **Save**.

> If you use Claude at work, your company may already have an account. Ask whoever looks after it for a key.

### Step 5: Turn on the helper

The helper is a tiny program that runs quietly in the background on your Mac. It passes the add-on's requests on to Claude.

Why it's needed: some Claude accounts, especially company ones with stricter data settings, block requests that come straight from a web browser. The helper sends them from your Mac instead.

1. Open the folder from Step 1, then the **helper** folder inside it.
2. **Right-click** **Install Helper** and choose **Open**. If your Mac warns you, click **Open** again.
3. A window opens and says **✅ Outreach helper is running**. You can close it.

That's it. The helper now starts by itself every time you turn on your Mac.

> **First time running it?** Your Mac might ask to install "command line developer tools". Click **Install**, wait for it to finish, then try again.

---

## Using it every day

1. Open someone's profile in **LinkedIn Recruiter**.
2. Click the **Outreach Drafter** icon.
3. Choose the role from **Playbook**.
4. *(Optional)* Add a note, e.g. *"referred by a colleague"* or *"mention we're hybrid in London"*.
5. Click **Scan Profile & Draft**. It takes about 20 to 40 seconds.
6. Switch between **Their Work** and **The Role**. The ★ shows the one it recommends.
7. Edit if you like, then click **Copy Message** and **Copy Subject**, and paste them into LinkedIn.

**Tip:** Did you add a new playbook in Notion? Click **Refresh from Notion** to see it.

---

## If something goes wrong

| You see… | What to do |
| --- | --- |
| **"Finish setting up"** | Open Settings and fill in anything that's missing (Steps 3 and 4). |
| **"Couldn't find a profile on this page"** | Make sure a profile is fully open, refresh the page, and try again. |
| **"The Outreach helper isn't running"** | Do Step 5 again. If you'd rather not keep it installed, double-click **Start Helper** whenever you need it and leave its window open. |
| **"Notion access expired"** | Settings → **Reconnect Notion**. |
| **A playbook is missing from the list** | Click **Refresh from Notion**. If it's still missing, check the page title contains "playbook", and that it sits inside the page you shared in Step 3.6. |
| **"You don't have permission to create internal connections"** in Notion | That's expected at most companies. Choose **OAuth** instead (Step 3.4). |
| **Notion won't let you allow the connection at all** | Your Notion admin has blocked new connections. Ask them to approve it. |

---

## Your privacy

- The add-on only reads a LinkedIn page **when you click the button**.
- Your keys are stored in your own Chrome, on your own computer.
- The profile and playbook go to **Claude**, only to write the messages. The add-on never sends them anywhere else.
- The helper only accepts requests from your own computer. It saves nothing and keeps no logs.
- **Nothing is ever sent on LinkedIn for you.** You always copy and paste the message yourself.

---

## Removing it

- **The helper:** open the **helper** folder and right-click **Uninstall Helper** → **Open**.
- **The add-on:** go to `chrome://extensions` and click **Remove** on Outreach Drafter.
- Then delete the folder.

---

## Make it yours

Everything is written in plain English, so you can change it:

- **Tone, length and rules for the messages:** open `lib/claude.js` in any text editor. Edit the long block of instructions near the top, then save.
- **Which Notion pages count as playbooks:** change **Title contains** in Settings.
- **Faster and cheaper drafts:** switch **Model** to *Sonnet 5.5* in Settings.

After changing a file, go to `chrome://extensions` and click the ↻ reload arrow on Outreach Drafter.

---

<sub>For the technically curious: a Manifest V3 Chrome extension with a side panel, Notion OAuth via `chrome.identity`, and a small Python relay on 127.0.0.1:8787 that forwards requests to the Claude Messages API. It uses Claude Opus 5.5 with structured JSON output.</sub>
