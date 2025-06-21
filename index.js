const fs = require('node:fs/promises');
const fetch = require("node-fetch");
const nodePandoc = require("node-pandoc");

/*
export enum SpecialEffectType {
  None = 0,
  BlackIn = 1,
  BlackOut = 2,
  WhiteIn = 3,
  WhiteOut = 4,
  ShakeScreen = 5,
  ShakeWindow = 6,
  ChangeBackground = 7,
  Telop = 8,
  FlashbackIn = 9,
  FlashbackOut = 10,
  ChangeCardStill = 11,
  AmbientColorNormal = 12,
  AmbientColorEvening = 13,
  AmbientColorNight = 14,
  PlayScenarioEffect = 15,
  StopScenarioEffect = 16,
  ChangeBackgroundStill = 17,
  PlaceInfo = 18,
  Movie = 19,
  SekaiIn = 20,
  SekaiOut = 21,
  AttachCharacterShader = 22,
  SimpleSelectable = 23,
  FullScreenText = 24,
  StopShakeScreen = 25,
  StopShakeWindow = 26,
}

export enum SnippetAction {
  None = 0,
  Talk = 1,
  CharacerLayout = 2,
  InputName = 3,
  CharacterMotion = 4,
  Selectable = 5,
  SpecialEffect = 6,
  Sound = 7,
}
*/

const badChars = {
  "windows": /[\<\>\:\"\/\\\|\?\*]/g,
  "markdown": /([\\\*\_\<\>\(\)\#\~])/g
};

const units = {
  "light_sound": "Leo/need",
  "idol": "MORE MORE JUMP!",
  "street": "Vivid BAD SQUAD",
  "theme_park": "Wonderlands×Showtime",
  "school_refusal": "Nightcord at 25:00",
  "piapro": "VIRTUAL SINGER"
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch (ex) {
    return false;
  }
};

const processSnippet = (eventStoryData, episodeData, snippet) => {
  let data;
  switch (snippet.Action) {
    case 1:
      data = episodeData.TalkData[snippet.ReferenceIndex];
      eventStoryData += `**${data.WindowDisplayName}:** ${data.Body.replace(/[\n\r]/g, " ").replace(badChars.markdown, "\\$1")}\n\n`;
      break;
    case 6:
      data = episodeData.SpecialEffectData[snippet.ReferenceIndex];
      if ([1, 10, 20].includes(data.EffectType)) {
        if (!eventStoryData.endsWith("---\n\n")) {
          eventStoryData += "---\n\n";
        }
      }
      if (data.EffectType == 8) {
        eventStoryData += `**-- ${data.StringVal.replace(badChars.markdown, "\\$1")} --**\n\n`;
      }
      if (data.EffectType == 9) {
        if (!eventStoryData.endsWith("---\n\n")) {
          eventStoryData += "---\n\n**-- Flashback --**\n\n";
        } else {
          eventStoryData += "**-- Flashback --**\n\n";
        }
      }
      break;
  }
  return eventStoryData;
};

const wait = require("util").promisify(setTimeout);

(async () => {
  if (! await fileExists("assets")) {
    await fs.mkdir("assets");
  }

  if (! await fileExists("Stories")) {
    await fs.mkdir("Stories");
  }

  // Unit Stories
  const unitStories = await fetch("https://sekai-world.github.io/sekai-master-db-en-diff/unitStories.json").then(res => res.json());
  if (! await fileExists("Stories/Unit Stories")) {
    console.log("Creating Unit Stories folder");
    await fs.mkdir("Stories/Unit Stories");
  }

  for (const unit of unitStories) {
    if (! await fileExists(`assets/${unit.unit}`)) {
      console.log(`Creating ${unit.unit} assets folder`);
      await fs.mkdir(`assets/${unit.unit}`);
    }
    if (! await fileExists(`Stories/Unit Stories/${units[unit.unit].replace(badChars.windows, "_")}`)) {
      console.log(`Creating ${units[unit.unit].replace(badChars.windows, "_")} folder`);
      await fs.mkdir(`Stories/Unit Stories/${units[unit.unit].replace(badChars.windows, "_")}`);
    }

    for (const chapter of unit.chapters) {
      if (! await fileExists(`Stories/Unit Stories/${units[unit.unit].replace(badChars.windows, "_")}/Chapter ${chapter.chapterNo}.epub`)) {
        console.log(`Generating chapter ${chapter.chapterNo}`);
        let eventStoryData = "";
        eventStoryData += `% ${chapter.title}\n\n`;

        for (const episode of chapter.episodes) {
          if (! await fileExists(`assets/${unit.unit}/${episode.assetbundleName}.json`)) {
            try {
              console.log("Downloading assets");
              const asset = await fetch(`https://storage.sekai.best/sekai-en-assets/scenario/unitstory/${chapter.assetbundleName}/${episode.scenarioId}.asset`).then(res => res.json());
              await fs.writeFile(`assets/${unit.unit}/${episode.assetbundleName}.json`, JSON.stringify(asset));
            } catch (ex) {
              console.error(ex);
            }
          }

          if (episode.title == "Opening") {
            eventStoryData += "# Opening\n\n---\n\n";
          } else {
            eventStoryData += `# ${episode.episodeNoLabel} - ${episode.title}\n\n---\n\n`;
          }

          const episodeData = require(`./assets/${unit.unit}/${episode.assetbundleName}.json`);
          for (const snippet of episodeData.Snippets) {
            eventStoryData = processSnippet(eventStoryData, episodeData, snippet);
          }
        }

        const pandocArgs = ["-f", "markdown", "-t", "epub", "-o", `Stories/Unit Stories/${units[unit.unit].replace(badChars.windows, "_")}/Chapter ${chapter.chapterNo}.epub`];
        nodePandoc(eventStoryData, pandocArgs, (err, result) => {
          if (err) return console.error(err);
        });
      }
    }
  }

  // Event Stories
  const events = await fetch("https://sekai-world.github.io/sekai-master-db-en-diff/events.json").then(res => res.json());
  const eventStories = await fetch("https://sekai-world.github.io/sekai-master-db-en-diff/eventStories.json").then(res => res.json());
  if (! await fileExists("Stories/Event Stories")) {
    console.log("Creating Event Stories folder");
    await fs.mkdir("Stories/Event Stories");
  }


  for (const story of eventStories) {
    if (! await fileExists(`assets/${story.assetbundleName}`)) {
      console.log(`Creating ${story.assetbundleName} assets folder`);
      await fs.mkdir(`assets/${story.assetbundleName}`);
    }
    if (! await fileExists(`assets/${story.assetbundleName}/metadata.json`)) {
      console.log(`Downloading metadata for ${story.assetbundleName}`);
      const eventMetadata = story;
      eventMetadata.eventName = events.find(o => o.id == story.eventId).name;
      await fs.writeFile(`assets/${story.assetbundleName}/metadata.json`, JSON.stringify(eventMetadata));
    }

    const metadata = require(`./assets/${story.assetbundleName}/metadata.json`);
    if (! await fileExists(`Stories/Event Stories/${String(metadata.eventId).padStart(3, "0")} - ${metadata.eventName.replaceAll(badChars.windows, "_").replace(/\.$/, "")}.epub`)) {
      console.log(`Generating ${String(metadata.eventId).padStart(3, "0")} - ${metadata.eventName.replaceAll(badChars.windows, "_").replace(/\.$/, "")}`);
      let eventStoryData = "";
      eventStoryData += `% ${metadata.eventName.replace(badChars.markdown, "\\$1")}\n\n`;

      for (const episode of story.eventStoryEpisodes) {
        if (! await fileExists(`assets/${story.assetbundleName}/${episode.scenarioId}.json`)) {
          try {
            console.log("Downloading assets");
            const asset = await fetch(`https://storage.sekai.best/sekai-en-assets/event_story/${story.assetbundleName}/scenario/${episode.scenarioId}.asset`).then(res => res.json());
            await fs.writeFile(`assets/${story.assetbundleName}/${episode.scenarioId}.json`, JSON.stringify(asset));
          } catch (ex) {
            console.error(ex);
          }
          //await wait(500);
        }

        const episodeData = require(`./assets/${story.assetbundleName}/${episode.scenarioId}.json`);
        const episodeMetadata = metadata.eventStoryEpisodes.find(o => o.scenarioId == episodeData.ScenarioId);

        eventStoryData += `# Episode ${episodeMetadata.episodeNo} - ${episodeMetadata.title.replace(badChars.markdown, "\\$1")}\n\n---\n\n`;

        for (const snippet of episodeData.Snippets) {
          eventStoryData = processSnippet(eventStoryData, episodeData, snippet);
        }
      }

      const pandocArgs = ["-f", "markdown", "-t", "epub", "-o", `Stories/Event Stories/${String(metadata.eventId).padStart(3, "0")} - ${metadata.eventName.replace(badChars.windows, "_").replace(/\.$/, "")}.epub`];
      nodePandoc(eventStoryData, pandocArgs, (err, result) => {
        if (err) return console.error(err);
      });
    }
  }
})();
