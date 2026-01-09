import dotenv from "dotenv";
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  Collection,
  TextDisplayBuilder,
  MediaGalleryBuilder,
  ContainerBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  FileUploadBuilder,
  LabelBuilder,
  TextInputComponent,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} from "discord.js";
import fs from "fs";

//loads token from .env file
dotenv.config();

/**
  guild_vars is a dictionary with each key being the guild id and the value being an object containing vars for the guild
  the object contains 5 variables:
    setup:boolean
      describes whether the setup command has been run for the guild or not
    private: ChannelType
      the channel private threads will be made from, the applicant will not see this channel
    public: ChannelType
      the channel public threads will be made from, the applicatn will see this channel
    admin: RoleType
      the role that can see the private thread and make decisions on the application
    channels: dictionary object with each key being a member id and each value being an object containing:
      private: ThreadType
        the thread where admin roles can discuss the application
      public: ThreadType
        the thread where admin roles can talk with the applicant
 */
let guild_vars = new Collection();

// takes the current guild_vars and saves it to guild_vars.json
const write_vars_to_file = () => {
  let varToSave = {};
  guild_vars.each((guild_var, guild_id) => {
    let guildVarToSave = {};

    guildVarToSave.setup = guild_var.setup;
    guildVarToSave.private = guild_var.private.id;
    guildVarToSave.public = guild_var.public.id;
    guildVarToSave.admin = guild_var.admin.id;
    let channels = guild_var.channels;
    Object.keys(channels).forEach((key) => {
      channels[key].private = channels[key].private.id;
      channels[key].public = channels[key].public.id;
    });
    guildVarToSave.channels = channels;
    varToSave[guild_id] = guildVarToSave;
  });
  fs.writeFileSync("guild_vars.json", JSON.stringify(varToSave));
};

// writes the values saved in guild_vars.json into guild_vars
const read_vars_from_file = async () => {
  const varFromFile = JSON.parse(fs.readFileSync("guild_vars.json", "utf8"));

  for (const [key, value] of Object.entries(varFromFile)) {
    const guild = await client.guilds.fetch(key);

    const private_channel = await guild.channels.fetch(value.private);
    const public_channel = await guild.channels.fetch(value.public);
    const admin_role = await guild.roles.fetch(value.admin);

    let channels = {};
    await Promise.all(
      Object.keys(value.channels).map(async (user) => {
        const user_channels = value.channels[user];

        channels[user] = {
          private: await private_channel.threads.fetch(user_channels.private),
          public: await public_channel.threads.fetch(user_channels.public),
        };
      }),
    );

    await guild_vars.set(key, {
      setup: value.setup,
      private: private_channel,
      public: public_channel,
      admin: admin_role,
      channels: channels,
    });
  }
};

//discord client setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

//do this only one time after client is ready
client.once(Events.ClientReady, (readyClient) => {
  console.log(`Ready! Logged in as ${readyClient.user.tag}`);

  read_vars_from_file();

  //create slash commands

  //set up slash command to post the apply button
  const apply_button_post = new SlashCommandBuilder()
    .setName("apply_button_post")
    .setDescription("Post Apply Button");

  //sets up slash command to configure channels/roles
  const setup = new SlashCommandBuilder()
    .setName("setup")
    .setDescription(
      "sets up the register command in the current discord server",
    )
    .addChannelOption((option) =>
      option
        .setName("public_channel")
        .setDescription(
          "the catagory channels will be made to talk with the applicant",
        )
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("private_channel")
        .setDescription(
          "the catagory channels will be made to discuss the applicant in private",
        )
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName("decider_role")
        .setDescription(
          "The Role that makes the final decision on all aplications",
        )
        .setRequired(true),
    );

  //adds slash commands
  client.application.commands.create(setup);
  client.application.commands.create(apply_button_post);

  console.log("registered slash commands");
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    //writes the configuration to guild_vars and saves it
    if (interaction.commandName == "setup") {
      await guild_vars.set(interaction.member.guild.id, {
        setup: true,
        private: interaction.options.getChannel("private_channel"),
        public: interaction.options.getChannel("public_channel"),
        admin: interaction.options.getRole("decider_role"),
        channels: { ...guild_vars.get(interaction.member.guild.id)?.channels },
      });

      write_vars_to_file();

      interaction.reply({
        content: "Setup Complete!",
        flags: MessageFlags.Ephemeral,
      });

      //posts the apply button the channel the slash command was ran
    } else if (interaction.commandName == "apply_button_post") {
      let apply_channel = interaction.channel;

      const apply_button = new ButtonBuilder()
        .setCustomId(`apply_button`)
        .setLabel("Apply Now")
        .setStyle(ButtonStyle.Success);

      const apply_row = new ActionRowBuilder().addComponents(apply_button);

      await apply_channel.send({
        components: [apply_row],
      });

      await interaction.reply({
        content: "Application button sent",
        flags: MessageFlags.Ephemeral,
      });

      return;
    }
  } else if (interaction.isButton()) {
    //opens the application form
    if (interaction.customId === "apply_button") {
      const apply_modal = new ModalBuilder()
        .setCustomId("application_form")
        .setTitle("Eternal Defiance Application");

      const username_input = new TextInputBuilder()
        .setCustomId("username")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(128);
      const username_label = new LabelBuilder()
        .setLabel("Username")
        .setDescription("What is your albion username on the west server?")
        .setTextInputComponent(username_input);

      const returning_input = new StringSelectMenuBuilder()
        .setCustomId("returning")
        .setRequired(true)
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel("No").setValue("No"),
          new StringSelectMenuOptionBuilder().setLabel("Yes").setValue("Yes"),
        );

      const returning_label = new LabelBuilder()
        .setLabel("Returning member?")
        .setDescription("Are you a returning member to Eternal Defiance?")
        .setStringSelectMenuComponent(returning_input);

      const vouches_input = new TextInputBuilder()
        .setCustomId("vouches")
        .setStyle(TextInputStyle.Short)
        .setMaxLength(1024)
        .setRequired(false);

      const vouches_label = new LabelBuilder()
        .setLabel("Vouches")
        .setDescription(
          "List any players in guild that would vouch for your application",
        )
        .setTextInputComponent(vouches_input);

      const stats_input = new FileUploadBuilder().setCustomId("stats");

      const stats_label = new LabelBuilder()
        .setLabel("Stats")
        .setDescription("Add a picture of your Character's Statistics Page")
        .setFileUploadComponent(stats_input);

      const charecter_input = new FileUploadBuilder().setCustomId("charecters");

      const charecter_label = new LabelBuilder()
        .setLabel("Charecters")
        .setDescription("Add a picture of your Character Selection Screen")
        .setFileUploadComponent(charecter_input);

      apply_modal.addLabelComponents(
        username_label,
        returning_label,
        vouches_label,
        stats_label,
        charecter_label,
      );

      await interaction.showModal(apply_modal);
    }
    //close the application and archive/lock all related threads
    if (interaction.customId.startsWith("close")) {
      await interaction.guild.members.fetch();
      let user = await interaction.guild.members.cache.find((member) => {
        return member.id === interaction.customId.slice(6);
      });
      let guild_var = guild_vars.get(interaction.guild.id);
      guild_var.channels[user.id].private.setLocked(true);
      guild_var.channels[user.id].private.setArchived(true);
      guild_var.channels[user.id].public.setLocked(true);
      guild_var.channels[user.id].public.setArchived(true);

      interaction.reply({
        content: `The Application has been closed`,
      });
    }
  } else if (interaction.isModalSubmit) {
    // on application submit, opens threads and posts info
    if (interaction.customId === "application_form") {
      const guild = interaction.member.guild;
      const member = interaction.member;
      let guild_var = guild_vars.get(guild.id);

      if (!guild_var || !guild_var.setup) {
        interaction.reply({
          content: "This command has not been successfully set up yet",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
      if (guild_var.channels[member.id]) {
        if (guild_var.channels[member.id].private.locked) {
          let private_thread = guild_var.channels[member.id].private;
          let public_thread = guild_var.channels[member.id].public;
          await private_thread.setArchived(false);
          await private_thread.setLocked(false);
          await public_thread.setArchived(false);
          await public_thread.setLocked(false);

          const exampleContainer_public = new ContainerBuilder()
            .setAccentColor(0x0099ff)
            .addTextDisplayComponents((textDisplay) =>
              textDisplay.setContent(
                `## ${
                  interaction.user.username
                }'s Application\nusername: ${interaction.fields.getTextInputValue(
                  "username",
                )}\nReturning Player: ${interaction.fields.getStringSelectValues(
                  "returning",
                )}\nVouches: ${interaction.fields.getTextInputValue("vouches")}`,
              ),
            )
            .addMediaGalleryComponents((mediadisplay) =>
              mediadisplay.addItems(
                (mediagalleryitem) =>
                  mediagalleryitem
                    .setDescription("Stats Page")
                    .setURL(
                      interaction.fields.getUploadedFiles("stats").at(0).url,
                    ),
                (mediagalleryitem) =>
                  mediagalleryitem
                    .setDescription("Charecter Screen")
                    .setURL(
                      interaction.fields.getUploadedFiles("charecters").at(0)
                        .url,
                    ),
              ),
            );
          const exampleContainer_private = new ContainerBuilder()
            .setAccentColor(0x0099ff)
            .addTextDisplayComponents((textDisplay) =>
              textDisplay.setContent(
                `## ${
                  interaction.user.username
                }'s Application\nusername: ${interaction.fields.getTextInputValue(
                  "username",
                )}\nReturning Player: ${interaction.fields.getStringSelectValues(
                  "returning",
                )}\nVouches: ${interaction.fields.getTextInputValue("vouches")}`,
              ),
            )
            .addMediaGalleryComponents((mediadisplay) =>
              mediadisplay.addItems(
                (mediagalleryitem) =>
                  mediagalleryitem
                    .setDescription("Stats Page")
                    .setURL(
                      interaction.fields.getUploadedFiles("stats").at(0).url,
                    ),
                (mediagalleryitem) =>
                  mediagalleryitem
                    .setDescription("Charecter Screen")
                    .setURL(
                      interaction.fields.getUploadedFiles("charecters").at(0)
                        .url,
                    ),
              ),
            )
            .addActionRowComponents((actionRow) =>
              actionRow.setComponents(
                new ButtonBuilder()
                  .setCustomId(`close-${interaction.user.id}`)
                  .setLabel("Close Application")
                  .setStyle(ButtonStyle.Primary),
              ),
            );

          await public_thread.send({
            components: [exampleContainer_public],
            flags: MessageFlags.IsComponentsV2,
          });

          await private_thread.send({
            components: [exampleContainer_private],
            flags: MessageFlags.IsComponentsV2,
          });

          interaction.reply({
            content: "Reopened old thread",
            flags: MessageFlags.Ephemeral,
          });
          return;
        } else
          interaction.reply({
            content: "You already have a channel open",
            flags: MessageFlags.Ephemeral,
          });
        return;
      }

      let public_thread = await guild_var.public.threads.create({
        name: interaction.user.username + " Application",
        reason: "Need a thread for discussion with this applicant",
        type: ChannelType.PrivateThread,
        invitable: false,
      });

      await guild_var.admin.members.forEach((member) => {
        public_thread.members.add(member);
      });
      await public_thread.members.add(interaction.user);

      let private_thread = await guild_var.private.threads.create({
        name: interaction.user.username + " Application",
        reason: "Need a thread for discussion with this applicant",
        // type: ChannelType.PrivateThread,
        invitable: false,
      });

      guild_var.channels[interaction.user.id] = {
        private: private_thread,
        public: public_thread,
      };
      write_vars_to_file();

      interaction.reply({
        content: "Creating a text channel for your application",
        flags: MessageFlags.Ephemeral,
      });

      const exampleContainer_public = new ContainerBuilder()
        .setAccentColor(0x0099ff)
        .addTextDisplayComponents((textDisplay) =>
          textDisplay.setContent(
            `## ${
              interaction.user.username
            }'s Application\nusername: ${interaction.fields.getTextInputValue(
              "username",
            )}\nReturning Player: ${interaction.fields.getStringSelectValues(
              "returning",
            )}\nVouches: ${interaction.fields.getTextInputValue("vouches")}`,
          ),
        )
        .addMediaGalleryComponents((mediadisplay) =>
          mediadisplay.addItems(
            (mediagalleryitem) =>
              mediagalleryitem
                .setDescription("Stats Page")
                .setURL(interaction.fields.getUploadedFiles("stats").at(0).url),
            (mediagalleryitem) =>
              mediagalleryitem
                .setDescription("Charecter Screen")
                .setURL(
                  interaction.fields.getUploadedFiles("charecters").at(0).url,
                ),
          ),
        );
      const exampleContainer_private = new ContainerBuilder()
        .setAccentColor(0x0099ff)
        .addTextDisplayComponents((textDisplay) =>
          textDisplay.setContent(
            `## ${
              interaction.user.username
            }'s Application\nusername: ${interaction.fields.getTextInputValue(
              "username",
            )}\nReturning Player: ${interaction.fields.getStringSelectValues(
              "returning",
            )}\nVouches: ${interaction.fields.getTextInputValue("vouches")}`,
          ),
        )
        .addMediaGalleryComponents((mediadisplay) =>
          mediadisplay.addItems(
            (mediagalleryitem) =>
              mediagalleryitem
                .setDescription("Stats Page")
                .setURL(interaction.fields.getUploadedFiles("stats").at(0).url),
            (mediagalleryitem) =>
              mediagalleryitem
                .setDescription("Charecter Screen")
                .setURL(
                  interaction.fields.getUploadedFiles("charecters").at(0).url,
                ),
          ),
        )
        .addActionRowComponents((actionRow) =>
          actionRow.setComponents(
            new ButtonBuilder()
              .setCustomId(`close-${interaction.user.id}`)
              .setLabel("Close Application")
              .setStyle(ButtonStyle.Primary),
          ),
        );

      await public_thread.send({
        components: [exampleContainer_public],
        flags: MessageFlags.IsComponentsV2,
      });

      await private_thread.send({
        components: [exampleContainer_private],
        flags: MessageFlags.IsComponentsV2,
      });
    }
  }
});

client.login(process.env.token);
