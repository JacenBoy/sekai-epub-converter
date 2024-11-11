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
  "markdown": /([\\\*\_\<\>\(\)\#])/g
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch (ex) {
    return false;
  }
};

const wait = require("util").promisify(setTimeout);

(async () => {
  if (! await fileExists("assets")) {
    await fs.mkdir("assets");
  }
  if (! await fileExists("Event Stories")) {
    await fs.mkdir("Event Stories");
  }

  const events = await fetch("https://sekai-world.github.io/sekai-master-db-en-diff/events.json").then(res => res.json());
  const eventStories = await fetch("https://sekai-world.github.io/sekai-master-db-en-diff/eventStories.json").then(res => res.json());

  for (story of eventStories) {
    if (! await fileExists(`assets/${story.assetbundleName}`)) {
      await fs.mkdir(`assets/${story.assetbundleName}`);
    }
    if (! await fileExists(`assets/${story.assetbundleName}/metadata.json`)) {
      const eventMetadata = story;
      eventMetadata.eventName = events.find(o => o.id == story.eventId).name;
      await fs.writeFile(`assets/${story.assetbundleName}/metadata.json`, JSON.stringify(eventMetadata));
    }

    const metadata = require(`./assets/${story.assetbundleName}/metadata.json`);
    if (! await fileExists(`Event Stories/${String(metadata.eventId).padStart(3, "0")} - ${metadata.eventName.replaceAll(badChars.windows, "_").replace(/\.$/, "")}.epub`)) {
      let eventStoryData = "";
      eventStoryData += `% ${metadata.eventName.replace(badChars.markdown, "\\$1")}\n\n`;

      for (const episode of story.eventStoryEpisodes) {
        if (! await fileExists(`assets/${story.assetbundleName}/${episode.scenarioId}.json`)) {
          try {
            const asset = await fetch(`https://storage.sekai.best/sekai-en-assets/event_story/${story.assetbundleName}/scenario_rip/${episode.scenarioId}.asset`).then(res => res.json());
            await fs.writeFile(`assets/${story.assetbundleName}/${episode.scenarioId}.json`, JSON.stringify(asset));
          } catch (ex) {
            console.error(ex);
          }
          //await wait(500);
        }

        const episodeData = require(`./assets/${story.assetbundleName}/${episode.scenarioId}.json`);
        const episodeMetadata = metadata.eventStoryEpisodes.find(o => o.scenarioId == episodeData.ScenarioId);

        eventStoryData += `# ${episodeMetadata.episodeNo} - ${episodeMetadata.title.replace(badChars.markdown, "\\$1")}\n\n---\n\n`;

        for (snippet of episodeData.Snippets) {
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
        }
      }

      const pandocArgs = ["-f", "markdown", "-t", "epub", "-o", `Event Stories/${String(metadata.eventId).padStart(3, "0")} - ${metadata.eventName.replace(badChars.windows, "_").replace(/\.$/, "")}.epub`];
      nodePandoc(eventStoryData, pandocArgs, (err, result) => {
        if (err) return console.error(err);
      });
    }
  }
})();
