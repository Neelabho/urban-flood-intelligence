# Getting the site onto Google: step-by-step

Site address: **https://neelabho.github.io/urban-flood-intelligence/**

The site is already prepared for search engines: every page has its own address, title and description, and there is a
sitemap at `https://neelabho.github.io/urban-flood-intelligence/sitemap.xml` and a `robots.txt` that allows crawling.
What is left is telling Google the site exists and proving it is yours. Allow about 15 minutes.

---

## Step 1. Add the site to Search Console

1. Go to **https://search.google.com/search-console** and sign in with your Google account.
2. If this is your first site, a "Select property type" screen appears. Otherwise click the property menu at the top
   left and choose **Add property**.
3. Use the box on the **right**, labelled **URL prefix**. Do **not** use the "Domain" box: you do not own `github.io`,
   so Domain verification will fail.
4. Type exactly, including `https://` and the slash at the end:

   ```
   https://neelabho.github.io/urban-flood-intelligence/
   ```

5. Click **Continue**.

## Step 2. Prove the site is yours (HTML tag method)

1. On the "Verify ownership" screen, scroll to **Other verification methods** and click **HTML tag**.
2. Google shows a line like this (your code will be different):

   ```html
   <meta name="google-site-verification" content="AbCdEf1234567890..." />
   ```

   Click **Copy**. **Leave this browser tab open**; you will come back to press Verify.
3. Put the tag on the site. Choose **one** of these:
   * **Easiest:** paste the whole tag into the chat with Claude and ask for it to be added and deployed.
   * **Yourself:** open `frontend/index.html`, find the line `<meta name="robots" content="index, follow" />`, and paste
     the tag on the next line. Save, then run:

     ```bash
     git add frontend/index.html
     git commit -m "Add Google Search Console verification"
     git push
     ```
4. Wait for the deployment to finish (about 2 minutes). On GitHub, open the repository's **Actions** tab: the newest
   **Deploy static site to GitHub Pages** run must show a green tick.
5. Check the tag is live: open the site, right-click → **View page source**, and press Ctrl+F (Cmd+F on a Mac) to search
   for `google-site-verification`.
6. Go back to the Search Console tab and click **Verify**. You should see "Ownership verified".

> **Keep the tag on the site permanently.** If it is removed, Google eventually stops recognising you as the owner.

*Alternative:* the **HTML file** method also works. Download the `google….html` file Google offers, put it in
`frontend/public/`, commit and push, then click Verify.

## Step 3. Submit the sitemap

1. In the left menu, click **Sitemaps** (under "Indexing").
2. In **Add a new sitemap**, the start of the address is already filled in. Type only:

   ```
   sitemap.xml
   ```

3. Click **Submit**. After a short while the status should read **Success**, with **10** discovered pages.
   * If it says **Couldn't fetch**, this is common for brand-new properties. Wait a day and it usually changes to
     Success on its own. If not, remove it and submit it again.

## Step 4. Ask Google to index the main pages now

1. Click the search bar at the very top of Search Console ("Inspect any URL in …").
2. Paste the home page address and press Enter:

   ```
   https://neelabho.github.io/urban-flood-intelligence/
   ```

3. It will say **URL is not on Google**. That is expected for a new site.
4. Optional check: click **Test live URL**. It should say **URL is available to Google**. Click **View tested page** →
   **Screenshot** to see the page as Google sees it.
5. Click **Request indexing** and wait for the confirmation (up to a minute).
6. Repeat for the most important pages (always with the slash at the end):

   ```
   https://neelabho.github.io/urban-flood-intelligence/intelligence/
   https://neelabho.github.io/urban-flood-intelligence/live/
   https://neelabho.github.io/urban-flood-intelligence/events/
   https://neelabho.github.io/urban-flood-intelligence/exposure/
   ```

   Google limits how many requests you can make per day (roughly 10). The sitemap takes care of the rest.

## Step 5. Wait, then check

* Indexing usually takes **a few days to a few weeks** for a new site. Nothing more is needed in the meantime.
* To see what Google has indexed, search Google for:

  ```
  site:neelabho.github.io/urban-flood-intelligence
  ```

* In Search Console:
  * **Indexing → Pages** shows which pages are indexed and why others are not.
  * **Performance** shows the searches people used to find the site (it fills in after the site starts appearing).

## Step 6. Help people (and Google) find it

* Add the link to your **GitHub profile README**, **LinkedIn** (a short post about the project works well) and any
  portfolio site. Links from other sites help Google discover and rank pages.
* The repository's "About" box already links to the site and has topics set (flood, kolkata, urban-flooding, …).
* Optional: add the site to **Bing Webmaster Tools** (https://www.bing.com/webmasters). It can import your Search
  Console site in one click, which also covers DuckDuckGo and Yahoo results.

## Common messages and what they mean

| Message in Search Console | Meaning | What to do |
|---|---|---|
| Discovered, currently not indexed | Google knows the page but has not crawled it yet | Normal for new sites; wait |
| Crawled, currently not indexed | Google looked but has not added it yet | Wait; add links to the site from elsewhere |
| Page with redirect | You inspected an address without the final `/` | Use the address ending in `/` |
| Alternate page with proper canonical tag | A duplicate address points to the main one | Nothing to do |
| Couldn't fetch (sitemap) | Temporary for new properties | Wait a day, resubmit if needed |

No one can guarantee a position in search results. New sites usually show up first for specific searches such as
"Kolkata waterlogging map" or "Kolkata flood risk map".
