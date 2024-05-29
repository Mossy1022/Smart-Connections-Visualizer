import { App, Plugin, PluginSettingTab, Setting, ItemView, WorkspaceLeaf } from 'obsidian';
import * as d3 from "d3";

interface MyPluginSettings {
    mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    mySetting: 'default'
}

declare global {
    interface Window {
        SmartSearch: any;
    }
}

class MyItemView extends ItemView {
    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    getViewType(): string {
        return "My Item View";
    }

    getDisplayText(): string {
        return "My Item View";
    }

    getIcon(): string {
        return "dice";
    }

	async onOpen() {
		let scoreThreshold = 0.85;
	
		const smartNotes = window.SmartSearch.main.env.smart_notes.items;
		const noteKeys = Object.keys(smartNotes);
	
		if (noteKeys.length === 0) {
			console.log("No smart notes found.");
			return;
		}
	
		console.log('SmartNotes:', smartNotes);
		console.log('NoteKeys:', noteKeys);
	
		let nodes: any[] = [];
		let links: any[] = [];
		let connections: any[] = [];
	
		function validateGraphData(nodes: any[], links: any[]): boolean {
			const nodeIds = new Set(nodes.map(node => node.id));
			let isValid = true;
	
			links.forEach((link, index) => {
				if (!nodeIds.has(link.source)) {
					console.error(`Link at index ${index} has an invalid source: ${link.source}`);
					isValid = false;
				}
				if (!nodeIds.has(link.target)) {
					console.error(`Link at index ${index} has an invalid target: ${link.target}`);
					isValid = false;
				}
			});
	
			nodes.forEach((node, index) => {
				if (!node.hasOwnProperty('id') || !node.hasOwnProperty('name') || !node.hasOwnProperty('group')) {
					console.error(`Node at index ${index} is missing required properties: ${JSON.stringify(node)}`);
					isValid = false;
				}
			});
	
			return isValid;
		}
	
		const updateConnections = () => {
			nodes = [];
			links = [];
			connections = [];
	
			noteKeys.forEach(noteKey => {
				const note = smartNotes[noteKey];
				const noteConnections = note.find_connections().filter((connection: any) => connection.score >= scoreThreshold);
	
				// Add the note node itself
				if (note.key && note.key.trim() !== '' && !nodes.some(node => node.id === note.key)) {
					nodes.push({
						id: note.key,
						name: note.key,
						group: 'note',
						isSmartNote: true,  // Mark this node as a smart note
						x: Math.random() * 1000,
						y: Math.random() * 1000,
						fx: null,
						fy: null
					});
				}
	
				// Filter out only blocks
				const blockConnections = noteConnections.filter((connection: any) => connection.__proto__.constructor.name === 'SmartBlock');
	
				// Adding connections from blockConnections
				blockConnections.forEach((connection: any, index: any) => {
					if (connection && connection.data && connection.data.key && connection.data.key.trim() !== '') {
						const connectionId = connection.data.key;
	
						if (!nodes.some(node => node.id === connectionId)) {
							nodes.push({
								id: connectionId,
								name: connectionId,
								group: 'block',
								isSmartNote: false,  // Mark this node as not a smart note
								x: Math.random() * 1000,
								y: Math.random() * 1000,
								fx: null,
								fy: null
							});
						}
	
						links.push({
							source: note.key,
							target: connectionId,
							value: connection.score || 0  // Ensure score is defined
						});
	
						connections.push({
							source: note.key,
							target: connectionId,
							score: connection.score || 0  // Ensure score is defined
						});
					} else {
						console.warn(`Skipping invalid connection at index ${index}:`, connection);
					}
				});
	
				// Adding Smart Blocks from the note itself
				const smartBlocks = note.blocks;
				smartBlocks.forEach((block: any) => {
					if (block.key && block.key.trim() !== '' && !nodes.some(node => node.id === block.key)) {
						nodes.push({
							id: block.key,
							name: block.key,
							group: 'block',
							isSmartNote: false,  // Mark this node as not a smart note
							x: Math.random() * 1000,
							y: Math.random() * 1000,
							fx: null,
							fy: null
						});
					}
	
					links.push({
						source: note.key,
						target: block.key,
						value: 0.95  // Ensure score is defined
					});
	
					connections.push({
						source: note.key,
						target: block.key,
						score: 0.95  // Ensure score is defined
					});
				});
			});
	
			console.log('Nodes after updateConnections:', nodes);
			console.log('Links after updateConnections:', links);
			console.log('Connections after updateConnections:', connections);
	
			const isValid = validateGraphData(nodes, links);
			if (!isValid) {
				console.error('Graph data validation failed.');
			} else {
				console.log('Graph data validation passed.');
			}
		};
	
		const width = 1000;
		const height = 1000;
	
		const svg = d3.select(this.contentEl)
			.append('svg')
			.attr('width', width)
			.attr('height', height)
			.call(d3.zoom()
				.scaleExtent([0.1, 10])
				.on('zoom', (event) => {
					svgGroup.attr('transform', event.transform);
				}));
	
		const svgGroup = svg.append('g');
	
		const simulation = d3.forceSimulation()
			.force('center', d3.forceCenter(width / 2, height / 2))
			.force('charge', d3.forceManyBody().strength(-10))
			.force('link', d3.forceLink().id((d: any) => d.id).distance(150))
			.force('collide', d3.forceCollide().radius(30).strength(0.7));
	
		updateConnections();
	
		let link = svgGroup.append('g')
			.attr('class', 'links')
			.selectAll('line')
			.data(links)
			.enter().append('line')
			.attr('stroke', 'white')
			.attr('stroke-width', 2)
			.attr('stroke-opacity', 0.6);
	
		let node = svgGroup.append('g')
			.attr('class', 'nodes')
			.selectAll('circle')
			.data(nodes)
			.enter().append('circle')
			.attr('r', d => 10 + (links.filter(link => link.source === d.id || link.target === d.id).length) * 2)  // Set radius based on number of connections
			.attr('fill', d => d.isSmartNote ? 'red' : 'blue')  // Set color based on whether it's a smart note
			.call(d3.drag()
				.on('start', (event, d: any) => {
					if (!event.active) simulation.alphaTarget(0.3).restart();
					d.fx = d.x;
					d.fy = d.y;
				})
				.on('drag', (event, d: any) => {
					d.fx = event.x;
					d.fy = event.y;
				})
				.on('end', (event, d: any) => {
					if (!event.active) simulation.alphaTarget(0);
					d.fx = null;
					d.fy = null;
				}));
	
		let nodeLabels = svgGroup.append('g')
			.attr('class', 'labels')
			.selectAll('text')
			.data(nodes)
			.enter().append('text')
			.attr('dx', 12)
			.attr('dy', '.35em')
			.text((d: any) => d.name);
	
		const tooltip = d3.select(this.contentEl)
			.append('div')
			.attr('class', 'tooltip')
			.style('position', 'absolute')
			.style('visibility', 'hidden')
			.style('background', '#fff')
			.style('padding', '5px')
			.style('border', '1px solid #ccc')
			.style('border-radius', '5px');
	
		node.on('mouseover', function(event, d: any) {
			tooltip.text(d.name)
				.style('visibility', 'visible');
		}).on('mousemove', function(event) {
			tooltip.style('top', (event.pageY - 10) + 'px')
				.style('left', (event.pageX + 10) + 'px');
		}).on('mouseout', function() {
			tooltip.style('visibility', 'hidden');
		});
	
		const controlContainer = d3.select(this.contentEl)
			.append('div')
			.style('position', 'absolute')
			.style('top', '10px')
			.style('left', '50%')
			.style('transform', 'translateX(-50%)')
			.style('display', 'flex')
			.style('align-items', 'center')
			.style('background', '#fff')
			.style('padding', '10px')
			.style('border', '1px solid #ccc')
			.style('border-radius', '5px')
			.style('box-shadow', '0px 4px 6px rgba(0, 0, 0, 0.1)');
	
			controlContainer.append('button')
		.text('Toggle Pin/Unpin Nodes')
		.style('padding', '10px')
		.style('font-size', '16px')
		.style('margin-right', '20px')
		.on('click', () => {
			const pinned = nodes.some(node => node.fx !== null && node.fy !== null);
			nodes.forEach(node => {
				if (pinned) {
					node.fx = null;
					node.fy = null;
				} else {
					node.fx = node.x;
					node.fy = node.y;
				}
			});
			simulation.alpha(1).restart();
		});

	controlContainer.append('label')
		.text('Score Threshold:')
		.style('margin-right', '10px')
		.style('font-size', '16px');

	controlContainer.append('input')
		.attr('type', 'range')
		.attr('min', '0')
		.attr('max', '1')
		.attr('step', '0.1')
		.attr('value', '0.6')
		.style('margin-right', '10px')
		.on('input', function(event) {
			scoreThreshold = parseFloat((event.target as HTMLInputElement).value);
			updateVisualization();
		});

	const updateVisualization = () => {
		updateConnections();

		console.log('Connections before filtering:', connections);
		const filteredConnections = connections.filter((connection: any) => connection.score >= scoreThreshold);
		console.log('Filtered Connections:', filteredConnections);

		let visibleNodes = new Set<string>();
		filteredConnections.forEach((connection) => {
			visibleNodes.add(connection.source);
			visibleNodes.add(connection.target);
		});

		const nodesData = Array.from(visibleNodes).map(id => {
			const node = nodes.find(node => node.id === id);
			if (node) {
				console.log(`Node data for id ${id}:`, node);
				return node;
			} else {
				console.warn(`Node data missing for id ${id}`);
				return null;
			}
		}).filter(Boolean);

		console.log('Visible Nodes:', nodesData);

		const validatedLinks = filteredConnections.filter((link) => {
			const sourceNode = nodesData.find(node => node.id === link.source);
			const targetNode = nodesData.find(node => node.id === link.target);

			if (!sourceNode || !targetNode) {
				console.error(`Invalid link found: ${link.source} -> ${link.target}`);
				return false;
			}
			return true;
		});

		console.log('Validated Links:', validatedLinks);

		// Count the number of links for each node
		const nodeLinkCount: { [key: string]: number } = {};
		validatedLinks.forEach((link) => {
			nodeLinkCount[link.source] = (nodeLinkCount[link.source] || 0) + 1;
			nodeLinkCount[link.target] = (nodeLinkCount[link.target] || 0) + 1;
		});

		// Add an initial random position to nodes to avoid overlap at (0,0)
		nodesData.forEach((node: any) => {
			if (node.x === undefined || node.y === undefined || node.x === null || node.y === null) {
				node.x = Math.random() * width;
				node.y = Math.random() * height;
				console.log(`Assigned random coordinates to node ${node.id}: (${node.x}, ${node.y})`);
			}
		});

		// Ensure no nodes have invalid coordinates
		nodesData.forEach((node: any) => {
			if (isNaN(node.x) || isNaN(node.y)) {
				console.error(`Node with invalid coordinates found: ${node.id} -> (${node.x}, ${node.y})`);
			}
		});

		// Update links
		const link = svgGroup.select('g.links').selectAll('line')
			.data(validatedLinks, (d: any) => `${d.source}-${d.target}`)
			.join(
				enter => enter.append('line')
					.attr('class', 'link')
					.attr('stroke', 'white')
					.attr('stroke-width', 2)
					.attr('stroke-opacity', 0.6),
				update => update,
				exit => exit.remove()
			);

		// Update nodes
		const node = svgGroup.select('g.nodes').selectAll('circle')
			.data(nodesData, (d: any) => d.id)
			.join(
				enter => enter.append('circle')
					.attr('class', 'node')
					.attr('r', d => 10 + (nodeLinkCount[d.id] || 0) * 2)  // Set radius based on number of connections
					.attr('fill', d => d.isSmartNote ? 'red' : 'blue')  // Set color based on whether it's a smart note
					.call(d3.drag()
						.on('start', (event, d: any) => {
							if (!event.active) simulation.alphaTarget(0.3).restart();
							d.fx = d.x;
							d.fy = d.y;
						})
						.on('drag', (event, d: any) => {
							d.fx = event.x;
							d.fy = event.y;
						})
						.on('end', (event, d: any) => {
							if (!event.active) simulation.alphaTarget(0);
							d.fx = null;
							d.fy = null;
						})
					),
				update => update,
				exit => exit.remove()
			);

		// Update node labels
		const nodeLabels = svgGroup.select('g.labels').selectAll('text')
			.data(nodesData, (d: any) => d.id)
			.join(
				enter => enter.append('text')
					.attr('class', 'label')
					.attr('dx', 12)
					.attr('dy', '.35em')
					.text((d: any) => d.name),
				update => update,
				exit => exit.remove()
			);

		console.log('Nodes in simulation before update:', simulation.nodes());
		console.log('Links in simulation before update:', (simulation.force('link') as any).links());

		simulation.nodes(nodesData);
		(simulation.force('link') as any).links(validatedLinks);

		console.log('Nodes in simulation after update:', simulation.nodes());
		console.log('Links in simulation after update:', (simulation.force('link') as any).links());

		// Restart the simulation
		simulation.alpha(1).restart();

		simulation.on('tick', () => {
			node
				.attr('cx', (d: any) => d.x)
				.attr('cy', (d: any) => d.y);

			link
				.attr('x1', (d: any) => d.source.x)
				.attr('y1', (d: any) => d.source.y)
				.attr('x2', (d: any) => d.target.x)
				.attr('y2', (d: any) => d.target.y);

			nodeLabels
				.attr('x', (d: any) => d.x)
				.attr('y', (d: any) => d.y);
		});
	};

	// Initial call to create the visualization
	updateVisualization();
	
}

}
	
	

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async onload() {
        await this.loadSettings();

        // Register the new view
        this.registerView("My Item View", (leaf: WorkspaceLeaf) => new MyItemView(leaf));

        // This creates an icon in the left ribbon.
        const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
            // Called when the user clicks the icon.
            // Create a new leaf in the current workspace
            let leaf = this.app.workspace.getLeaf(true);
    
            // Set the new leaf's view to your custom view
            leaf.setViewState({
                type: "My Item View",
                active: true,
            });
        })
        // Perform additional things with the ribbon
        ribbonIconEl.addClass('my-plugin-ribbon-class');

        // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText('Status Bar Text');

        // This adds a simple command that can be triggered anywhere
        this.addCommand({
            id: 'open-sample-modal-simple',
            name: 'Open sample modal (simple)',
            callback: () => {
                // Create a new leaf in the current workspace
                let leaf = this.app.workspace.getLeaf(true);
        
                // Set the new leaf's view to your custom view
                leaf.setViewState({
                    type: "My Item View",
                    active: true,
                });
            }
        });
        // This adds an editor command that can perform some operation on the current editor instance
        this.addCommand({
            id: 'sample-editor-command',
            name: 'Sample editor command',
            callback: () => {
                // Create a new leaf in the current workspace
                let leaf = this.app.workspace.getLeaf(true);
        
                // Set the new leaf's view to your custom view
                leaf.setViewState({
                    type: "My Item View",
                    active: true,
                });
            }
        });
        // This adds a complex command that can check whether the current state of the app allows execution of the command
        this.addCommand({
            id: 'open-sample-modal-complex',
            name: 'Open sample modal (complex)',
            callback: () => {
                // Create a new leaf in the current workspace
                let leaf = this.app.workspace.getLeaf(true);
        
                // Set the new leaf's view to your custom view
                leaf.setViewState({
                    type: "My Item View",
                    active: true,
                });
            }
        });

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new SampleSettingTab(this.app, this));

        // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
        // Using this function will automatically remove the event listener when this plugin is disabled.
        this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
            console.log('click', evt);
        });

        // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
        this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const {containerEl} = this;

        containerEl.empty();

        new Setting(containerEl)
            .setName('Setting #1')
            .setDesc('It\'s a secret')
            .addText(text => text
                .setPlaceholder('Enter your secret')
                .setValue(this.plugin.settings.mySetting)
                .onChange(async (value) => {
                    this.plugin.settings.mySetting = value;
                    await this.plugin.saveSettings();
                }));
    }
}
