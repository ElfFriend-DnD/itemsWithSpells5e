//@ts-check
import { ItemsWithSpells5e } from '../items-with-spells-5e.js';
import { ItemsWithSpells5eItemSpellOverrides } from './item-spell-overrides.js';
import { ItemsWithSpells5eItem } from './item.js';

/**
 * A class made to make managing the operations for an Item sheet easier.
 */
export class ItemsWithSpells5eItemSheet {
  /** A boolean to set when we are causing an item update we know should re-open to this tab */
  _shouldOpenSpellsTab = false;

  constructor(app, html) {
    this.app = app;
    this.item = app.item;
    this.sheetHtml = html;
    this.itemWithSpellsItem = new ItemsWithSpells5eItem(this.item);
  }

  /** MUTATED: All open ItemSheet have a cached instance of this class */
  static instances = new Map();

  /**
   * Handles the item sheet render hook
   */
  static init() {
    Hooks.on('renderItemSheet', (app, html) => {
      if (app.item.type === 'spell') {
        return;
      }

      ItemsWithSpells5e.log(false, {
        instances: this.instances,
      });

      if (this.instances.get(app.appId)) {
        const instance = this.instances.get(app.appId);

        instance.renderLite();

        if (instance._shouldOpenSpellsTab) {
          app._tabs?.[0]?.activate?.('spells');
          instance._shouldOpenSpellsTab = false;
        }
        return;
      }

      const newInstance = new this(app, html);

      this.instances.set(app.appId, newInstance);

      return newInstance.renderLite();
    });

    // clean up instances as sheets are closed
    Hooks.on('closeItemSheet', async (app) => {
      if (this.instances.get(app.appId)) {
        return this.instances.delete(app.appId);
      }
    });
  }

  /**
   * Renders the spell tab template to be injected
   */
  async _renderSpellsList() {
    const itemSpellsArray = [...(await this.itemWithSpellsItem.itemSpellItemMap).values()];
    ItemsWithSpells5e.log(false, 'rendering list', itemSpellsArray);
    return renderTemplate(ItemsWithSpells5e.TEMPLATES.spellsTab, {
      itemSpells: itemSpellsArray,
      isOwner: this.item.isOwner,
      isOwned: this.item.isOwned,
    });
  }

  /**
   * Ensure the item dropped is a spell, add the spell to the item flags.
   */
  async _dragEnd(event) {
    ItemsWithSpells5e.log(false, 'dragEnd', { event });

    let data;
    try {
      data = JSON.parse(event.dataTransfer.getData('text/plain'));
    } catch (err) {
      return;
    }

    ItemsWithSpells5e.log(false, 'dragEnd', { data });

    if (data.type !== 'Item') {
      return;
    }

    const item = await Item.implementation.fromDropData(data);
    ItemsWithSpells5e.log(false, 'dragEnd', { item });

    if (item.type !== 'spell') {
      return;
    }

    // set the flag to re-open this tab when the update completes
    this._shouldOpenSpellsTab = true;
    await this.itemWithSpellsItem.addSpellToItem(item.uuid);
  }

  async _handleItemClick(event) {
    const { itemId } = $(event.currentTarget).parents('[data-item-id]').data();
    const item = this.itemWithSpellsItem.itemSpellItemMap.get(itemId);
    item?.sheet.render(true, { editable: this.item.isOwned });
  }

  async _handleItemDeleteClick(event) {
    const { itemId } = $(event.currentTarget).parents('[data-item-id]').data();

    // set the flag to re-open this tab when the update completes
    this._shouldOpenSpellsTab = true;
    await this.itemWithSpellsItem.removeSpellFromItem(itemId);
  }

  async _handleItemEditClick(event) {
    const { itemId } = $(event.currentTarget).parents('[data-item-id]').data();
    // pop up a formapp to configure this item's overrides
    return new ItemsWithSpells5eItemSpellOverrides(this.itemWithSpellsItem, itemId).render(true);
  }

  /**
   * Synchronous part of the render which calls the asynchronous `render`
   * This allows for less delay during the update -> renderItemSheet -> set tab cycle
   */
  renderLite() {
    // Update the nav menu
    const spellsTabButton = $(
      '<a class="item" data-tab="spells">' + game.i18n.localize(`DND5E.ItemTypeSpellPl`) + '</a>',
    );
    const tabs = this.sheetHtml.find('.tabs[data-group="primary"]');

    if (!tabs) {
      return;
    }

    tabs.append(spellsTabButton);

    // Create the tab
    const sheetBody = this.sheetHtml.find('.sheet-body');
    const spellsTab = $(`<div class="tab spells flexcol" data-group="primary" data-tab="spells"></div>`);
    sheetBody.append(spellsTab);

    this.renderHeavy(spellsTab);
  }

  async renderHeavy(spellsTab) {
    // Add the list to the tab
    const spellsTabHtml = $(await this._renderSpellsList());
    spellsTab.append(spellsTabHtml);

    // Activate Listeners for this ui.
    spellsTabHtml.on('click', '.item-name', this._handleItemClick.bind(this));
    spellsTabHtml.on('click', '.item-delete', this._handleItemDeleteClick.bind(this));
    spellsTabHtml.on('click', '.configure-overrides', this._handleItemEditClick.bind(this));

    // Register a DragDrop handler for adding new spells to this item
    const dragDrop = new DragDrop({
      dragSelector: '.item',
      dropSelector: '.items-with-spells-tab',
      permissions: { drop: () => this.app.isEditable && !this.item.isOwned },
      callbacks: { drop: this._dragEnd.bind(this) },
    });

    dragDrop.bind(this.sheetHtml[0]);
  }
}
