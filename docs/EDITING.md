# Editing engin.al

## In the browser

1. Open **https://engin.al/admin/** and sign in (GitHub button, or "Sign in with Token" with a fine-grained GitHub token that can write to `casab/engin.al`).
2. Pick a collection:
   - **Projects**: one entry per thing built. Pick one or more channels (the first sets the colour), write a one-line summary, add links, optionally a cover image. Tick *Show on the home page* for the selected grid.
   - **Sound**: live sets, mixes, tracks. Paste a SoundCloud, Mixcloud, YouTube or Bandcamp link into *Listen link*; the page shows a player that only loads when someone clicks it.
   - **Distance notes**: races sync from Strava by themselves. Add a note only to rename one, write something about it, add a photo, force-show a non-race activity, or hide one. The id is the number at the end of the Strava activity URL.
   - **Notes**: the occasional write-up.
   - **Pages**: *Now* (keep it current: it feeds the ticker on the home page), *About*, *Sound → Rig* (instrument list), *Site settings*.
3. **Save.** The change is committed to `main` and the site is rebuilt and live about a minute later.

**Draft** hides an entry on the live site. It still shows locally in `npm run serve`, marked "draft".

## Tips

- Upload the **largest** version of an image; the build makes the small ones.
- Always fill in the image description (alt text). `npm run check` fails without it.
- Run `npm run strip-metadata` before committing photos by hand: it removes EXIF and GPS data.
- Tone: say what the thing does and what was hard about it. No skill bars, no "passionate".

## Locally

```sh
npm run serve
```

Then open http://localhost:8080/admin/ in Chrome or Edge and choose **Work with Local Repository**. Changes are written straight to the files in your checkout.
