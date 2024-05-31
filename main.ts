import { App, Plugin, PluginSettingTab, Setting, ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import * as d3 from "d3";
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap/dist/js/bootstrap.bundle.min.js';

interface ScGraphViewSettings {
    mySetting: string;
}

const DEFAULT_SETTINGS: ScGraphViewSettings = {
    mySetting: 'default'
}

const DEFAULT_NETWORK_SETTINGS : any = {
	scoreThreshold: 0.8,
	nodeSize: 3,
	linkThickness: 0.3,
	repelForce: 400,
	linkForce: 0.4,
	linkDistance: 70,
	centerForce: 0.40
}

declare global {
    interface Window {
        SmartSearch: any;
    }
}

class MyItemView extends ItemView {

	currentNoteKey: string; // Define the currentNoteKey property
	centralNote: any;
	centralNode: any;
	connectionType = 'block';
    isHovering: boolean; // Add a flag to track hover state
	relevanceScoreThreshold = 0.8;
	settingsInstantiated = false;
	nodeSize = 3;
	linkThickness = 0.3;
	repelForce = 400;
	linkForce = 0.4;
	linkDistance = 70;
	centerForce = 0.40;
	textFadeThreshold = 1.1;
	minScore = 1;
	maxScore = 0;
	minNodeSize = 3;
	maxNodeSize = 6;
	minLinkThickness = 0.3;
	maxLinkThickness = 4;
	nodeSelection : any;
	linkSelection : any;
	linkLabelSelection : any;
	labelSelection : any;
	updatingVisualization: boolean; // Add this flag
	isCtrlPressed = false;
	isAltPressed = false;
    isDragging = false;
	isChangingConnectionType = true;
    selectionBox: any;
	validatedLinks : any;
	maxLabelCharacters = 18; // Add max label characters property
	linkLabelSize = 7; // Add link label size property
	nodeLabelSize = 7; // Add node label size property
	
	// selection box origin point
	startX = 0;
	startY = 0;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
		this.currentNoteKey = '';
		this.isHovering = false; 
    }

    getViewType(): string {
        return "Smart Graph View";
    }

    getDisplayText(): string {
        return "Smart Graph View";
    }

    getIcon(): string {
        return "git-fork";
    }

	// Function to update node appearance based on selection and highlight state
	updateNodeAppearance() {
		this.nodeSelection.transition().duration(500)
			.attr('fill', (d: any) => {
				if (d.id === this.centralNode.id) {
					return '#7c8594';
				} else if (d.highlighted && !d.selected) {
					return '#d46ebe';
				} else {
					return d.group === 'note' ? '#7c8594' : '#926ec9';
				}
			})
			.attr('stroke', (d: any) => d.selected ? 'blanchedalmond' : 'transparent')
			.attr('stroke-width', (d: any) => { (d.selected && !this.isHovering) ? 1.5: 0.3 })
			.attr('opacity', (d: any) => {
				if (d.id === this.centralNode.id) {
					return 1;
				} else if (d.highlighted) {
					return 1;
				} else if (this.isHovering) {
					return 0.1;
				} else {
					return 1;
				}
			});
	}
	
    // Function to toggle node selection
    toggleNodeSelection(nodeId: string) {
        const node = this.nodeSelection.data().find((d: any) => d.id === nodeId);
        if (node) {
            node.selected = !node.selected;
            this.updateNodeAppearance();
        }
    }

	 // Clear all selections
	 clearSelections() {
        this.nodeSelection.each((d: any) => d.selected = false);
        this.updateNodeAppearance();
    }

	highlightNode(node: any) {
		this.nodeSelection.each((d: any) => {
			if (d.id !== this.centralNode.id) {
				d.highlighted = (d.id === node.id || this.validatedLinks.some((link: any) =>
					(link.source.id === node.id && link.target.id === d.id) ||
					(link.target.id === node.id && link.source.id === d.id)));
			}
		});
		this.updateNodeAppearance();
	
		this.linkSelection.transition().duration(500)
			.attr('opacity', (d: any) => (d.source.id === node.id || d.target.id === node.id) ? 1 : 0.1);
	
		this.labelSelection.transition().duration(500)
			.attr('opacity', (d: any) =>
				(d.id === node.id || this.validatedLinks.some((link: any) =>
					(link.source.id === node.id && link.target.id === d.id))) ? 1 : 0.1)
			.text((d: any) => {
				console.log('d: ', d.id === node.id);
				return d.id === node.id ? this.formatLabel(d.name, false) : this.formatLabel(d.name, true);
			}); // Show full label only for the highlighted node	
	
		this.linkLabelSelection.transition().duration(500)
			.attr('opacity', (d: any) => (d.source.id === node.id || d.target.id === node.id) ? 1 : 0);
	}
	
	
	
	unhighlightNode() {
		this.nodeSelection.each((d: any) => {
			if (d.id !== this.centralNode.id) {
            	d.highlighted = false;
        	}
		});
		this.updateNodeAppearance();
	
		this.linkSelection.transition().duration(500).attr('opacity', 1);
		this.labelSelection.transition().duration(500).attr('opacity', 1)
        .text((d: any) => this.formatLabel(d.name, true)); // Revert to truncated label
		this.linkLabelSelection.transition().duration(500).attr('opacity', 0);
		
	}

	// Helper function to truncate labels, extract filenames or parts after hashtags, and remove brackets
	formatLabel(path: string, truncate: boolean = true) {
		if (truncate) {
			if (path.includes('#')) {
				const parts = path.split('#');
				path = parts[parts.length - 1]; // Take the last part after splitting by '#'
				const cleanedPath = path.replace(/[\[\]]/g, ''); // Remove brackets
				return cleanedPath.length > this.maxLabelCharacters ? cleanedPath.slice(0, this.maxLabelCharacters) + '...' : cleanedPath;
			} else {
				const filename = path.split('/').pop();
				if (filename) {
					const cleanedFilename = filename.replace(/[\[\]]/g, ''); // Remove brackets
					return cleanedFilename.length > this.maxLabelCharacters ? cleanedFilename.slice(0, this.maxLabelCharacters) + '...' : cleanedFilename;
				}
			}
		} else {
			const parts = path.split('#');
				path = parts[parts.length - 1]; // Take the last part after splitting by '#'
				const cleanedPath = path.replace(/[\[\]]/g, ''); // Remove brac
			return cleanedPath; // Remove brackets without truncating
		}
		return '';
	};
	
	

	async onOpen() {

		setTimeout(() => {
		
			// To be used for functions that dont have this in the scope
			let that = this;
		
			const smartNotes  = window.SmartSearch.main.env.smart_notes.items;
		
			if (Object.keys(smartNotes).length === 0) {
				console.log("No smart notes found.");
				return;
			}
		
			console.log('SmartNotes:', smartNotes);
		
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

				// Reset Variables
				nodes = [];
				links = [];
				connections = [];
				this.minScore = 1;
				this.maxScore = 0;
		
				// Dont bother executing if we don't have a note to find connections for
				if (!this.currentNoteKey) return;
		
				this.centralNote = smartNotes[this.currentNoteKey];
				const noteConnections = this.centralNote.find_connections().filter(
					(connection: any) => connection.score >= this.relevanceScoreThreshold); 

				console.log('central note: ', this.centralNote);
				console.log('note connections: ', this.centralNote.find_connections());

				// Add the note node itself
				if (this.centralNote.key && this.centralNote.key.trim() !== '' && !nodes.some(node => node.id === this.centralNote.key)) {
					nodes.push({
						id: this.centralNote.key,
						name: this.centralNote.key,
						group: 'note',
						x: Math.random() * 1000,
						y: Math.random() * 1000,
						fx: null,
						fy: null,
						selected: false, // Add selected property
						highlighted : false

					});

					// Assign central node - 1st element in the array so far
					this.centralNode = nodes[0]; 

				}
		
				// Filter connections based on the selected connection type
				const filteredConnections = noteConnections.filter((connection: any) => connection.__proto__.constructor.name === (this.connectionType === 'block' ? 'SmartBlock' : 'SmartNote'));		
				// Adding connections from blockConnections

				filteredConnections.forEach((connection: any, index: any) => {
					if (connection && connection.data && connection.data.key && connection.data.key.trim() !== '') {
						const connectionId = connection.data.key;
		
						if (!nodes.some(node => node.id === connectionId)) {
							nodes.push({
								id: connectionId,
								name: connectionId,
								group: 'block',
								x: Math.random() * 1000,
								y: Math.random() * 1000,
								fx: null,
								fy: null,
								selected: false, // Add selected property
								highlighted : false
							});
						}
		
						links.push({
							source: this.centralNote.key,
							target: connectionId,
							value: connection.score || 0  // Ensure score is defined
						});
		
						connections.push({
							source: this.centralNote.key,
							target: connectionId,
							score: connection.score || 0  // Ensure score is defined
						});
	
						if((connection && connection.score) > this.maxScore) {
							this.maxScore = connection.score;
						}
	
						if((connection && connection.score) < this.minScore) {
							this.minScore = connection.score;
						}
	
					} else {
						console.warn(`Skipping invalid connection at index ${index}:`, connection);
					}
				});
		
				// TODO:: Remove eventually, but keep for now just in case we want this for some reason
				// Adding Smart Blocks from the note itself
				// const smartBlocks = note.blocks;
				// smartBlocks.forEach((block: any) => {
				// 	if (block.key && block.key.trim() !== '' && !nodes.some(node => node.id === block.key)) {
				// 		nodes.push({
				// 			id: block.key,
				// 			name: block.key,
				// 			group: 'block',
				// 			x: Math.random() * 1000,
				// 			y: Math.random() * 1000,
				// 			fx: null,
				// 			fy: null
				// 		});
				// 	}
		
				// 	links.push({
				// 		source: note.key,
				// 		target: block.key,
				// 		value: 0.95  // Ensure score is defined
				// 	});
		
				// 	connections.push({
				// 		source: note.key,
				// 		target: block.key,
				// 		score: 0.95  // Ensure score is defined
				// 	});
	
				// 	if((connection && connection.score) > this.maxScore) {
				// 		this.maxScore = connection.score;
				// 	}
	
				// });
		
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
		
			// Define the dimensions for the SVG
			const width = this.contentEl.clientWidth;
			const height = this.contentEl.clientHeight;
		
			const svg = d3.select(this.contentEl)
				.append('svg')
				.attr('width', '100%')
				.attr('height', '98%')
				.attr('viewBox', `0 0 ${width} ${height}`)
				.attr('preserveAspectRatio', 'xMidYMid meet')
				.call(d3.zoom()
					.scaleExtent([0.1, 10])
					.on('zoom', (event) => {
						svgGroup.attr('transform', event.transform);
						updateLabelOpacity(event.transform.k);
					}));
				
			const svgGroup = svg.append('g');
			
			const startBoxSelection = (event: any) => {
				if (!this.isCtrlPressed) return;
			
				this.isDragging = true;
				const [x, y] = d3.pointer(event);
			
				const transform = d3.zoomTransform(svg.node() as Element);
			
				this.selectionBox = svg.append('rect')
					.attr('class', 'selection-box')
					.attr('x', x)
					.attr('y', y)
					.attr('width', 0)
					.attr('height', 0)
					.attr('stroke', '#00f')
					.attr('stroke-width', 1)
					.attr('fill', 'rgba(0, 0, 255, 0.3)'); // Semi-transparent fill
			
				// Store the initial click point adjusted by zoom and pan
				this.startX = x;
				this.startY = y;
			};
			
			const updateBoxSelection = (event: any) => {
				if (!this.isDragging) return;
			
				const [x, y] = d3.pointer(event);
			
				const transform = d3.zoomTransform(svg.node() as Element);
			
				const newWidth = x - this.startX;
				const newHeight = y - this.startY;
			
				this.selectionBox
					.attr('width', Math.abs(newWidth))
					.attr('height', Math.abs(newHeight))
					.attr('x', Math.min(x, this.startX))
					.attr('y', Math.min(y, this.startY));
			
				const endX = this.startX + newWidth;
				const endY = this.startY + newHeight;
			
				// Ensure the coordinates account for drag direction
				const transformedStartX = Math.min(this.startX, endX);
				const transformedStartY = Math.min(this.startY, endY);
				const transformedEndX = Math.max(this.startX, endX);
				const transformedEndY = Math.max(this.startY, endY);
			
				// Adjust the coordinates for zoom and pan
				const zoomedStartX = (transformedStartX - transform.x) / transform.k;
				const zoomedStartY = (transformedStartY - transform.y) / transform.k;
				const zoomedEndX = (transformedEndX - transform.x) / transform.k;
				const zoomedEndY = (transformedEndY - transform.y) / transform.k;
			
				this.nodeSelection.each((d: any) => {
					const nodeX = d.x;
					const nodeY = d.y;
					if (nodeX >= zoomedStartX && nodeX <= zoomedEndX && nodeY >= zoomedStartY && nodeY <= zoomedEndY) {
						d.selected = true;
					} else {
						d.selected = false;
					}
				});
			
				this.updateNodeAppearance();
			};
			
			const endBoxSelection = () => {
				if (!this.isDragging) return;
				this.isDragging = false;
			
				this.selectionBox.remove();
			};
			
			
			// Attach mouse event listeners to the SVG
			svg.on('mousedown', (event: any) => {
				if (!event.ctrlKey) {
					this.clearSelections();
				}
				startBoxSelection(event);
			}).on('mousemove', updateBoxSelection)
			.on('mouseup', endBoxSelection)
			.on('click', function(event) {
				if (!event.defaultPrevented && !event.ctrlKey) {
					that.clearSelections();
				}
			});
					

			// Listen for Alt/Option key press for individual node selection
			document.addEventListener('keydown', (event) => {
				if (event.key === 'Alt' || event.key === 'AltGraph') {
					this.isAltPressed = true;
				}
			});

			document.addEventListener('keyup', (event) => {
				if (event.key === 'Alt' || event.key === 'AltGraph') {
					this.isAltPressed = false;
				}
			});


			// Listen for control key press
			document.addEventListener('keydown', (event) => {
				if (event.key === 'Control') {
					this.isCtrlPressed = true;
					svg.style('cursor', 'crosshair');

				}
			});
			
			document.addEventListener('keyup', (event) => {
				if (event.key === 'Control') {
					this.isCtrlPressed = false;
					svg.style('cursor', 'default');

				}
			});
			
	
			const updateLabelOpacity = (zoomLevel: number) => {
				const maxOpacity = 1; // Maximum opacity
				const minOpacity = 0; // Minimum opacity
				const minZoom = 0.1; // Minimum zoom level where opacity is 0
				const maxZoom = this.textFadeThreshold; // Use the text fade threshold value
			
				// Calculate the new opacity based on the zoom level
				let newOpacity = (zoomLevel - minZoom) / (maxZoom - minZoom);
	
				  // Ensure labels become invisible at lower zoom levels
				if (zoomLevel <= minZoom) {
					newOpacity = minOpacity;
				} else if (zoomLevel >= maxZoom) {
					newOpacity = maxOpacity;
				} else {
					// Calculate the new opacity based on the zoom level
					newOpacity = (zoomLevel - minZoom) / (maxZoom - minZoom);
				}
	
				// Clamp the opacity between 0 and 1
				newOpacity = Math.max(minOpacity, Math.min(maxOpacity, newOpacity));
	
				// Debug statements
				// console.log(`Zoom Level: ${zoomLevel}, New Opacity: ${newOpacity}, Fade Threshold: ${this.textFadeThreshold}`);
	
			
				svgGroup.selectAll('.label')
					.transition()
					.duration(300)
					.attr('opacity', newOpacity);
			};
			
			// Function to normalize relevance score and inverse it to have links with higher scores closer to the central node
			function inverseNormalize(value : number) {
				return 1 - ((value - that.minScore) / (that.maxScore - that.minScore));
			}		
	
			const simulation = d3.forceSimulation()
			.force('center', null) // Remove the default center force
			.force('charge', d3.forceManyBody().strength(-DEFAULT_NETWORK_SETTINGS.repelForce)) // Note the negative value for repulsion
			.force('link', d3.forceLink().id((d: any) => d.id).distance((d: any) => 50 + (inverseNormalize(d.score) * 100)).strength(1))
			.force('collide', d3.forceCollide().radius(DEFAULT_NETWORK_SETTINGS.nodeSize + 3).strength(0.7)) // Adjust radius based on node size
		
			updateConnections();
		
			let link = svgGroup.append('g')
				.attr('class', 'links')
				.selectAll('line')
				.data(links)
				.enter().append('line')
				.attr('stroke', 'blue')
				.attr('stroke-width', 2)
				.attr('stroke-opacity', 1);
		
			let node = svgGroup.append('g')
				.attr('class', 'nodes')
				.selectAll('circle')
				.data(nodes)
				.enter().append('circle')
				.attr('r', 20)
				.attr('fill', 'blue')
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
				.style('background', '#333') // Updated background color
				.style('color', '#fff') // Updated text color
				.style('padding', '5px')
				.style('border', '1px solid #444') // Updated border color
				.style('border-radius', '5px');
	
			// TODO:: Uncomment back in when want to start on tooltop func for link
			// Add tooltip event listeners to links
			// link.on('mouseover', function(event, d) {

			// 	tooltip.text(`relevance: ${d.scoretoFixed(3)}`)
			// .style('visibility', 'visible');
				
			// }).on('mousemove', function(event) {

			// 	const [x, y] = d3.pointer(event);
			// 	tooltip.style('top', `${y + 10}px`)
			// 		.style('left', `${x + 10}px`);

			// }).on('mouseout', function() {

			// 	tooltip.style('visibility', 'hidden');

			// });
			
			// TODO:: Uncomment back in when want to start on tooltop func for node
			// node.on('mouseover', function(event, d: any) {
			// 	tooltip.text(d.name)
			// 		.style('visibility', 'visible');
			// }).on('mousemove', function(event) {
			// 	const [x, y] = d3.pointer(event);
			// 	tooltip.style('top', `${y + 10}px`)
			// 		.style('left', `${x + 10}px`);
			// }).on('mouseout', function() {
			// 	tooltip.style('visibility', 'hidden');
			// });
	
			// Funcition to center the network on update
			const centerNetwork = () => {
				simulation
					.force('center', d3.forceCenter(width / 2, height / 2))
					.alpha(0.3)
					.restart();
			};
	
			

			// Function to rerender visualization with most up to date settings
			const updateVisualization = (newScoreThreshold?: number) => {

				// We dont want rapid calls if its already updating unless we are changing the network via connection type
				if (this.updatingVisualization && !this.isChangingConnectionType) {
					console.log('Update already in progress. Skipping...');
					return;
				} else {
					console.log('Update not in progress . Skipping...');
				}

				this.isChangingConnectionType = false;

				if (newScoreThreshold !== undefined) {
					this.relevanceScoreThreshold = newScoreThreshold;
				}
	
				updateConnections();
		
				// console.log('Connections before filtering:', connections);
				const filteredConnections = connections.filter((connection: any) => connection.score >= this.relevanceScoreThreshold);
				// console.log('Filtered Connections:', filteredConnections);
		
				let visibleNodes = new Set<string>();
				filteredConnections.forEach((connection) => {
					visibleNodes.add(connection.source);
					visibleNodes.add(connection.target);
				});
		
				const nodesData = Array.from(visibleNodes).map(id => {
					const node = nodes.find(node => node.id === id);
					if (node) {
						// console.log(`Node data for id ${id}:`, node);
						return node;
					} else {
						console.warn(`Node data missing for id ${id}`);
						return null;
					}
				}).filter(Boolean);
		
				console.log('Visible Nodes:', nodesData);
		
				this.validatedLinks = filteredConnections.filter((link) => {
					const sourceNode = nodesData.find(node => node.id === link.source);
					const targetNode = nodesData.find(node => node.id === link.target);
		
					if (!sourceNode || !targetNode) {
						console.error(`Invalid link found: ${link.source} -> ${link.target}`);
						return false;
					}
					return true;
				});
				console.log('Validated Links:', this.validatedLinks);
	
				// Safeguard to prevent infinite loop
				if (nodesData.length === 0 || this.validatedLinks.length === 0) {
					console.warn('No nodes or links to display after filtering. Aborting update.');
					return;
				}		
				
				//TODO:: For now, separate central node and other node sizes until we do a node size by feature
				const mainNodeSize = this.maxNodeSize;
				const otherNodeSize = this.minNodeSize;
	
				// Move forces towards central node
				if (this.centralNode) {
					this.centralNode.fx = width / 2;
					this.centralNode.fy = height / 2;
				}

				// Ensure lasting jittering of the nodes doesn't happen, so stop after 2 seconds
				const updateForces = () => {
					simulation.alpha(0.3).restart(); // Restart the simulation with initial alpha
					setTimeout(() => {
						this.updatingVisualization = false; // Reset the flag after stopping simulation
						simulation.alphaTarget(0).stop(); // Stop the simulation after 2 seconds
					}, 2000); 
				};
		
				this.nodeSelection = svgGroup.select('g.nodes').selectAll('circle')
					.data(nodesData, (d: any) => d.id)
					.join(
						enter => enter.append('circle')
						.attr('class', 'node')
						.attr('r', d => d.id === this.centralNode.id ? this.nodeSize + 2 : this.nodeSize)
						.attr('fill', d => (d.group === 'note' ? '#7c8594' : '#926ec9'))
						.attr('stroke', d => { return d.selected ? 'blanchedalmond' : 'transparent'})
						.attr('stroke-width', d => d.selected ? 1.5 : 0.3)
						.attr('opacity', 1)
						.attr('cursor', 'grab')
						.call(d3.drag()
							.on('start', function(event, d: any) {
								if (!event.active) simulation.alphaTarget(0.3).restart();
								// Store initial positions of selected nodes
								d.initialX = d.x;
								d.initialY = d.y;
								if (d.selected) {
									that.nodeSelection.each((node: any) => {
										if (node.selected) {
											node.initialX = node.x;
											node.initialY = node.y;
										}
									});
								}
							})
							.on('drag', function(event, d: any) {
								const dx = event.x - d.initialX;
								const dy = event.y - d.initialY;
								if (d.selected) {
									that.nodeSelection.each((node: any) => {
										if (node.selected) {
											node.fx = node.initialX + dx;
											node.fy = node.initialY + dy;
										}
									});
								} else {
									d.fx = event.x;
									d.fy = event.y;
								}
							})
							.on('end', function(event, d: any) {
								if (!event.active) simulation.alphaTarget(0);
								if (d.selected) {
									that.nodeSelection.each((node: any) => {
										if (node.selected) {
											node.fx = null;
											node.fy = null;
										}
									});
								} else {
									d.fx = null;
									d.fy = null;
								}
							})
						)
						.on('click', function(event : any, d: any) {
							event.stopPropagation();
							if (!that.isAltPressed) {
								that.clearSelections();
							}
							d.selected = !d.selected;
							that.updateNodeAppearance();
						})
						.on('mouseover', function(event : any, d: any) {
							that.isHovering = true;
							if (!d.selected) {
								if (d.id !== that.centralNode.id && !d.highlighted) {
									d3.select(this).transition().duration(500).attr('fill', '#d46ebe'); // Animate fill color to #d46ebe
								}
							}

							that.highlightNode(d);
					
							d3.select(this).attr('stroke', d.selected ? 'blanchedalmond' : '#fff').attr('stroke-width', d.selected ? 1.5 : 0.3); // Change stroke color to white on hover
							svgGroup.select(`text[data-id='${d.id}']`).transition().duration(250).attr('y', d.y + 4); // Animate label down 10 pixels
					
							event.stopPropagation();
					
							that.app.workspace.trigger("hover-link", {
								event,
								source: 'D3',
								hoverParent: this.parentElement,
								targetEl: this,
								linktext: d.id,
							});
						}).on('mouseout', function(event : any, d: any) {
							that.isHovering = false;
							if (!d.selected) {
								if (d.id !== that.centralNode.id) {
									d3.select(this).transition().duration(500).attr('fill', d.group === 'note' ? '#7c8594' : '#926ec9'); // Animate fill color back to original
								}
							}
							that.unhighlightNode();
							d3.select(this).attr('stroke', d.selected ? 'blanchedalmond' : 'transparent').attr('stroke-width', d.selected ? 1.5 : 0.3); // Change stroke color back to less visible on mouse out
							svgGroup.select(`text[data-id='${d.id}']`).transition().duration(250).attr('y', d.y);
						}),
						update => update
							.attr('r', d => d.id === this.centralNode.id ? this.nodeSize + 2 : this.nodeSize)
							.attr('fill', d => d.selected ? '#f3ee5d' : (d.group === 'note' ? '#7c8594' : '#926ec9'))
							.attr('stroke', d => d.selected ? '#blanchedalmond' : (d.group === 'note' ? '#7c8594' : '#926ec9'))
							.attr('stroke-width', d => d.selected ? 1.5 : 0.3),
						exit => exit.remove()
					);

	
				this.linkSelection = svgGroup.select('g.links').selectAll('line')
					.data(this.validatedLinks, (d: any) => `${d.source}-${d.target}`)
					.join(
						enter => enter.append('line')
							.attr('class', 'link')
							.attr('stroke', '#4c7787') // Adjusted color to match the blue hue
							.attr('stroke-width',(d: any) => d3.scaleLinear()
							.domain([this.minScore, this.maxScore]) // Ensure this domain matches your score range
							.range([this.minLinkThickness, this.maxLinkThickness])(d.score)) // Thinner stroke width
							.attr('stroke-opacity', 1)
							.attr('opacity', 1)
							.on('mouseover', function(event, d : any) {
								// Leacing here for when we use hover
								// const [x, y] = d3.pointer(event);
								// tooltip.text(`Signficance: ${d.score.toFixed(3)}`)
								// 	.style('visibility', 'visible');
							}).on('mousemove', function(event) {
								// const [x, y] = d3.pointer(event);
								// tooltip.style('top', `${y + 10}px`)
								// 	.style('left', `${x}px`);
							}).on('mouseout', function() {
								// tooltip.style('visibility', 'hidden');
							}),
						update => update
							.attr('stroke', '#4c7787')
							.attr('stroke-width',(d: any) => d3.scaleLinear()
							.domain([this.minScore, this.maxScore]) // Ensure this domain matches your score range
							.range([this.minLinkThickness, this.maxLinkThickness])(d.score)),
							// .on('mouseover', function(event, d : any) {
							// }).on('mousemove', function(event, d :any) {
							// 	// Calculate the position of the tooltip relative to the SVG coordinate system
							// }).on('mouseout', function() {
							// 	tooltip.style('visibility', 'hidden');
						exit => exit.remove()
					);

					this.linkLabelSelection = svgGroup.append('g')
					.attr('class', 'link-labels')
					.selectAll('text')
					.data(this.validatedLinks, (d: any) => `${d.source.id}-${d.target.id}`)
					.join(
						enter => enter.append('text')
							.attr('class', 'link-label')
							.attr('font-size', this.linkLabelSize)
							.attr('fill', '#bbb')
							.attr('opacity', 0)
							.text((d: any) => (d.score * 100).toFixed(1)),
						update => update.text((d: any) => (d.score * 100).toFixed(1)),
						exit => exit.remove()
					);
				
		
				this.labelSelection = svgGroup.select('g.labels').selectAll('text')
					.data(nodesData, (d: any) => d.id)
					.join(
						enter => enter.append('text')
							.attr('class', 'label')
							.attr('dx', 0) // Centered horizontally
							.attr('font-size', this.nodeLabelSize)
							.attr('dy', 12) // Positioned right underneath
							.attr('text-anchor', 'middle') // Center align text
							.attr('fill', '#bbb')
							.attr('opacity', 1) // Set initial opacity
							.text((d: any) => this.formatLabel(d.name)),
						update => update
							.attr('dx', 0) // Centered horizontally
							.attr('dy', 12) // Positioned right underneath
							.attr('text-anchor', 'middle') // Center align text
							.text((d: any) => this.formatLabel(d.name))
							.attr('fill', '#bbb')
							.attr('font-size', 4)
							.attr('opacity', 1), // Ensure updated opacity is 1
						exit => exit.remove()
					)
					.attr('x', (d: any) => d.x)
					.attr('y', (d: any) => d.y);
	
				simulation.nodes(nodesData);
				(simulation.force('link') as any).links(this.validatedLinks);
	
				simulation.alpha(0.3).alphaTarget(0.05).restart();

				updateForces();

				simulation.on('tick', () => {
		
					this.nodeSelection
						.attr('cx', (d: any) => d.x)
						.attr('cy', (d: any) => d.y);
	
					this.linkSelection
						.attr('x1', (d: any) => d.source.x)
						.attr('y1', (d: any) => d.source.y)
						.attr('x2', (d: any) => d.target.x)
						.attr('y2', (d: any) => d.target.y);

					this.linkLabelSelection
					.attr('x', (d: any) => (d.source.x + d.target.x) / 2)
					.attr('y', (d: any) => (d.source.y + d.target.y) / 2); // Position at the midpoint of the link				
	
					svgGroup.select('g.labels').selectAll('text')
						.data(nodesData, (d: any) => d.id)
						.join(
							enter => enter.append('text')
								.attr('class', 'label')
								.attr('dx', 12)
								.attr('dy', '.35em')
								.attr('fill', '#bbb')
								.attr('data-id', d => d.id)
								.text((d: any) => this.formatLabel(d.name, true)), // Set initial label with truncation
							update => update
								.text((d: any) => this.formatLabel(d.name, true)) // Ensure updated label is truncated
								.attr('fill', '#bbb')
								.attr('data-id', d => d.id),
							exit => exit.remove()
						)
						.attr('x', (d: any) => d.x)
						.attr('y', (d: any) => d.y); // Position label below the node
	
						// Update label opacity based on initial zoom level
						updateLabelOpacity(d3.zoomTransform(svg.node() as Element).k);
				});

				this.updatingVisualization = true; // Set the flag to true
	
			
			};
	
	
			if (!this.settingsInstantiated) {
	
				// Ensure that the settings menu and its elements are only created once
				if (document.querySelector('.settings-icon')) {
					console.log("score settings exist");
					// If settings menu is already set up, skip setup
					return;
				} else {
					console.log("score doesnt")
				}
	
				// Create the settings icon
				const settingsIcon = document.createElement('div');
				settingsIcon.innerHTML = '&#9881;'; // Unicode for gear icon
				settingsIcon.classList.add('settings-icon');
				this.contentEl.appendChild(settingsIcon);
	
				// SVG icon for dropdown arrow
				const dropdownArrow = `
				<svg class="dropdown-indicator" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor">
					<path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
				</svg>`;
	
				const rightArrow = `
				<svg class="dropdown-indicator" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor">
				<path fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
				</svg>`;
	
				// Create the dropdown menu
				const dropdownMenu = document.createElement('div');
				dropdownMenu.classList.add('dropdown-menu');
				dropdownMenu.innerHTML = `
					<div class="menu-header">
						<div class="icon" id="refresh-icon">&#8635;</div> <!-- Unicode for refresh icon -->
						<div class="icon" id="close-icon">&#10005;</div> <!-- Unicode for X (close) icon -->
					</div>
					<div class="accordion-item">
						<div class="accordion-header">
							<span class="arrow-icon">${rightArrow}</span>Filters
						</div>			
						<div class="accordion-content">
							<div class="slider-container">
								<label id="scoreThresholdLabel" for="scoreThreshold">Min Relevance: ${this.relevanceScoreThreshold * 100}</label>
								<input type="range" id="scoreThreshold" class="slider" name="scoreThreshold" min="0" max="0.99" value="${this.relevanceScoreThreshold}" step="0.01">
							</div>
							<label class="settings-item-content-label">Connection Type:</label>
							<div class="radio-container">
								<label>
									<input type="radio" name="connectionType" value="block" ${this.connectionType === 'block' ? 'checked' : ''}> Block
								</label>
								<label>
									<input type="radio" name="connectionType" value="note" ${this.connectionType === 'note' ? 'checked' : ''}> Note
								</label>
							</div>
						</div>
					</div>
					<!--
					<div class="accordion-item">
						<div class="accordion-header">
							<span class="arrow-icon">${rightArrow}</span>Groups
						</div>	
						<div class="accordion-content">
							<input type="checkbox" id="group1" name="group1" checked>
							<label for="group1">Group 1</label><br>
							<input type="checkbox" id="group2" name="group2" checked>
							<label for="group2">Group 2</label>
						</div>
					</div> 
					--!>
					<div class="accordion-item">
						<div class="accordion-header">
							<span class="arrow-icon">${rightArrow}</span>Display
						</div>	
						<div class="accordion-content">
							<div class="slider-container">
								<label id="fadeThresholdLabel" for="fadeThreshold"> Text Fade Threshold: ${this.textFadeThreshold}</label>
								<input type="range" id="fadeThreshold" class="slider" name="fadeThreshold" min="0.1" max="10" value="1.2" step="0.01">
							</div>
							<div class="slider-container">
								<label id="nodeSizeLabel" for="nodeSize">Node Size: ${this.nodeSize}</label>
								<input type="range" id="nodeSize" class="slider" name="nodeSize" min="1" max="15" value="${this.nodeSize}" step="0.01">
							</div>
							<div class="slider-container">
								<label id="maxLabelCharactersLabel" for="maxLabelCharacters">Max Label Characters: ${this.maxLabelCharacters}</label>
								<input type="range" id="maxLabelCharacters" class="slider" name="maxLabelCharacters" min="1" max="50" value="${this.maxLabelCharacters}" step="1">
							</div>
							<div class="slider-container">
								<label id="linkLabelSizeLabel" for="linkLabelSize">Link Label Size: ${this.linkLabelSize}</label>
								<input type="range" id="linkLabelSize" class="slider" name="linkLabelSize" min="1" max="15" value="${this.linkLabelSize}" step="0.01">
							</div>
							<div class="slider-container">
								<label id="nodeLabelSizeLabel" for="nodeLabelSize">Node Label Size: ${this.nodeLabelSize}</label>
								<input type="range" id="nodeLabelSize" class="slider" name="nodeLabelSize" min="1" max="26" value="${this.nodeLabelSize}" step="1">
							</div>
							<div class="slider-container">
								<label id="minLinkThicknessLabel" for="minLinkThickness">Min Link Thickness: ${this.minLinkThickness}</label>
								<input type="range" id="minLinkThickness" class="slider" name="minLinkThickness" min="0.1" max="10" value="${this.minLinkThickness}" step="0.01">
							</div>
							<div class="slider-container">
								<label id="maxLinkThicknessLabel" for="maxLinkThickness">Max Link Thickness: ${this.maxLinkThickness}</label>
								<input type="range" id="maxLinkThickness" class="slider" name="maxLinkThickness" min="0.1" max="10" value="${this.maxLinkThickness}" step="0.01">
							</div>
							<!-- <div class="slider-container">
								<label id="lineThicknessLabel" for="lineThickness">Line Thickness: ${this.linkThickness}</label>
								<input type="range" id="lineThickness" class="slider" name="lineThickness"  min="0.1" max="5" value="${this.linkThickness}" step="0.01">
							</div> --!>
						</div>
					</div>
					<div class="accordion-item">
						<div class="accordion-header">
							<span class="arrow-icon">${rightArrow}</span>Forces
						</div>	
						<div class="accordion-content">
							<div class="slider-container">
								<label for="centerForce" id="centerForceLabel">Center Force: ${this.centerForce}</label>
								<input type="range" id="centerForce" name="centerForce" class="slider" min="0" max="1" value="${this.centerForce}" step="0.01">
							</div>
							<div class="slider-container">
								<label for="repelForce" id="repelForceLabel">Repel Force:  ${this.repelForce}</label>
								<input type="range" id="repelForce" name="repelForce" class="slider" min="0" max="1500" value="${this.repelForce}" step="1">
							</div>
							<div class="slider-container">
								<label for="linkForce" id="linkForceLabel">Link Force:  ${this.linkForce}</label>
								<input type="range" id="linkForce" name="linkForce" class="slider" min="0" max="1" value=" ${this.linkForce}" step="0.01">
							</div>
								<label for="linkDistance" id="linkDistanceLabel">Link Distance:  ${this.linkDistance}</label>
								<input type="range" id="linkDistance" name="linkDistance" class="slider" min="10" max="200" value="${this.linkDistance}" step="1">
						</div>
					</div>
				`;
						
				this.contentEl.appendChild(dropdownMenu);
	
				// Toggle dropdown menu visibility on settings icon click
				settingsIcon.addEventListener('click', () => {
					dropdownMenu.classList.toggle('open');
				});
	
				// Toggle accordion content visibility and arrow icon on header click
				const accordionHeaders = dropdownMenu.querySelectorAll('.accordion-header');
				accordionHeaders.forEach(header => {
					header.addEventListener('click', () => {
						const content = header.nextElementSibling;
						const arrowIcon = header.querySelector('.arrow-icon');
	
						if (content && arrowIcon) { // Add null check for arrowIcon
							content.classList.toggle('show');
							if (content.classList.contains('show')) {
								arrowIcon.innerHTML = dropdownArrow;
							} else {
								arrowIcon.innerHTML = rightArrow;
							}
						}
					});
				});
	
				// Now query the DOM for the slider and label
				const scoreThresholdSlider = document.getElementById('scoreThreshold') as HTMLInputElement;
				const scoreThresholdLabel = document.getElementById('score-threshold-label');
				const nodeSizeSlider = document.getElementById('nodeSize') as HTMLInputElement;
				const nodeSizeLabel = document.getElementById('nodeSizeLabel');
				const lineThicknessSlider = document.getElementById('lineThickness') as HTMLInputElement;
				const lineThicknessLabel = document.getElementById('lineThicknessLabel');
				const centerForceSlider = document.getElementById('centerForce') as HTMLInputElement;
				const centerForceLabel = document.getElementById('centerForceLabel');
				const repelForceSlider = document.getElementById('repelForce') as HTMLInputElement;
				const repelForceLabel = document.getElementById('repelForceLabel');
				const linkForceSlider = document.getElementById('linkForce') as HTMLInputElement;
				const linkForceLabel = document.getElementById('linkForceLabel');
				const linkDistanceSlider = document.getElementById('linkDistance') as HTMLInputElement;
				const linkDistanceLabel = document.getElementById('linkDistanceLabel');
				const fadeThresholdSlider = document.getElementById('fadeThreshold') as HTMLInputElement;
				const fadeThresholdLabel = document.getElementById('fadeThresholdLabel');
				const minLinkThicknessSlider = document.getElementById('minLinkThickness') as HTMLInputElement;
				const minLinkThicknessLabel = document.getElementById('minLinkThicknessLabel');
				const maxLinkThicknessSlider = document.getElementById('maxLinkThickness') as HTMLInputElement;
				const maxLinkThicknessLabel = document.getElementById('maxLinkThicknessLabel');
				const connectionTypeRadios = document.querySelectorAll('input[name="connectionType"]');
				const maxLabelCharactersSlider = document.getElementById('maxLabelCharacters') as HTMLInputElement;
				const maxLabelCharactersLabel = document.getElementById('maxLabelCharactersLabel');
				const linkLabelSizeSlider = document.getElementById('linkLabelSize') as HTMLInputElement;
				const linkLabelSizeLabel = document.getElementById('linkLabelSizeLabel');
				const nodeLabelSizeSlider = document.getElementById('nodeLabelSize') as HTMLInputElement;
				const nodeLabelSizeLabel = document.getElementById('nodeLabelSizeLabel');

				if (maxLabelCharactersSlider) {
					maxLabelCharactersSlider.addEventListener('input', (event) => {
						const newMaxLabelCharacters = parseInt((event.target as HTMLInputElement).value, 10);
						if (maxLabelCharactersLabel) {
							maxLabelCharactersLabel.textContent = `Max Label Characters: ${newMaxLabelCharacters}`;
						}
						this.maxLabelCharacters = newMaxLabelCharacters;
						updateNodeLabels();
					});
				}

				if (linkLabelSizeSlider) {
					linkLabelSizeSlider.addEventListener('input', (event) => {
						const newLinkLabelSize = parseFloat((event.target as HTMLInputElement).value);
						if (linkLabelSizeLabel) {
							linkLabelSizeLabel.textContent = `Link Label Size: ${newLinkLabelSize}`;
						}
						this.linkLabelSize = newLinkLabelSize;
						updateLinkLabelSizes();
					});
				}

				if (nodeLabelSizeSlider) {
					nodeLabelSizeSlider.addEventListener('input', (event) => {
						const newNodeLabelSize = parseFloat((event.target as HTMLInputElement).value);
						if (nodeLabelSizeLabel) {
							nodeLabelSizeLabel.textContent = `Node Label Size: ${newNodeLabelSize}`;
						}
						this.nodeLabelSize = newNodeLabelSize;
						updateNodeLabelSizes();
					});
				}


				// Event listener for Connection Type Radios slider
				if (connectionTypeRadios) {
					connectionTypeRadios.forEach(radio => {
						radio.addEventListener('change', (event) => {
							this.connectionType = (event.target as HTMLInputElement).value;
							this.isChangingConnectionType = true;
							updateVisualization();
						});
					});
				}	

				// Event listener for Min Link Thickness slider
				if (minLinkThicknessSlider) {
					minLinkThicknessSlider.addEventListener('input', (event) => {
						const newMinLinkThickness = parseFloat((event.target as HTMLInputElement).value);
						if (minLinkThicknessLabel) {
							minLinkThicknessLabel.textContent = `Min Link Thickness: ${newMinLinkThickness}`;
						}
						this.minLinkThickness = newMinLinkThickness;
						updateLinkThickness();
					});
				}
	
				// Event listener for Max Link Thickness slider
				if (maxLinkThicknessSlider) {
					maxLinkThicknessSlider.addEventListener('input', (event) => {
						const newMaxLinkThickness = parseFloat((event.target as HTMLInputElement).value);
						if (maxLinkThicknessLabel) {
							maxLinkThicknessLabel.textContent = `Max Link Thickness: ${newMaxLinkThickness}`;
						}
						this.maxLinkThickness = newMaxLinkThickness;
						updateLinkThickness();
					});
				}
	
				// Event listener for Text Fade Threshold slider
				if (fadeThresholdSlider) {
					fadeThresholdSlider.addEventListener('input', (event) => {
						const newFadeThreshold = parseFloat((event.target as HTMLInputElement).value);
						if (fadeThresholdLabel) {
							fadeThresholdLabel.textContent = `Fade Threshold: ${newFadeThreshold}`;
						}
						this.textFadeThreshold = newFadeThreshold;
						// Update the label opacity immediately to reflect the new threshold
						updateLabelOpacity(d3.zoomTransform(svg.node() as Element).k);
					});
				}
	
				// Event listener for Center Force slider
				if (centerForceSlider) {
					centerForceSlider.addEventListener('input', (event) => {
						const newCenterForce = parseFloat((event.target as HTMLInputElement).value);
						if (centerForceLabel) {
							centerForceLabel.textContent = `Center Force: ${newCenterForce}`;
						}
						updateCenterForce(newCenterForce);
	
					});
				}
				
				// Event listener for Repel Force slider
				if (repelForceSlider) {
					repelForceSlider.addEventListener('input', (event) => {
						const newRepelForce = parseFloat((event.target as HTMLInputElement).value);
						if (repelForceLabel) {
							repelForceLabel.textContent = `Repel Force: ${newRepelForce}`;
						}
						updateRepelForce(newRepelForce);
					});
				}
				
				// Event listener for Link Force slider
				if (linkForceSlider) {
					linkForceSlider.addEventListener('input', (event) => {
						const newLinkForce = parseFloat((event.target as HTMLInputElement).value);
						if (linkForceLabel) {
							linkForceLabel.textContent = `Link Force: ${newLinkForce}`;
						}
						updateLinkForce(newLinkForce);
					});
				}
	
				// Event listener for Link Distance slider
				if (linkDistanceSlider) {
					linkDistanceSlider.addEventListener('input', (event) => {
						const newLinkDistance = parseFloat((event.target as HTMLInputElement).value);
						if (linkDistanceLabel) {
							linkDistanceLabel.textContent = `Link Distance: ${newLinkDistance}`;
						}
						updateLinkDistance(newLinkDistance);
	
					});
				}

				// Function to update center force based on the slider value
				const updateCenterForce = (newCenterForce: number) => {
					simulation.force('center', null); // Remove the existing center force
					simulation.force('center', d3.forceCenter(width / 2, height / 2).strength(newCenterForce)); // Add the new center force
					simulation.alphaTarget(0.3).restart();
					updateForces();
	
				};
				
				// Function to update repel force based on the slider value
				const updateRepelForce = (newRepelForce: number) => {
					(simulation.force('charge') as any).strength(-newRepelForce);
					simulation.alphaTarget(0.3).restart();
					updateForces();
	
				};
	
				const updateLinkThickness = () => {
					const linkStrokeScale = d3.scaleLinear()
						.domain([this.minScore, this.maxScore]) // Update this to match your score range
						.range([this.minLinkThickness, this.maxLinkThickness]);
				
					this.linkSelection.attr('stroke-width', (d: any) => linkStrokeScale(d.score));
				};
				
	
				// Function to update link force based on the slider value
				const updateLinkForce = (newLinkForce: number) => {
					simulation.force('link', null); // Remove the existing link force
					simulation.force('link', d3.forceLink(this.validatedLinks).id((d: any) => d.id).strength(newLinkForce).distance(this.linkDistance)); // Add the new link force
					simulation.alphaTarget(0.3).restart(); // Smoothly adjust without a full restart
					updateForces();
	
				};
				
				// Function to update link distance based on the slider value
				const updateLinkDistance = (newLinkDistance: number) => {
					simulation.force('link', null); // Remove the existing link force
					simulation.force('link', d3.forceLink(this.validatedLinks).id((d: any) => d.id).distance(newLinkDistance).strength(this.linkForce)); // Add the new link force with the current distance
					simulation.alphaTarget(0.3).restart(); // Smoothly adjust without a full restart
					updateForces();
	
				};
	
				// Function to ensure network stops in case nodes get jittery
				const updateForces = () => {
					simulation.alpha(0.3).restart(); // Restart the simulation with initial alpha
					setTimeout(() => {
						simulation.alphaTarget(0).stop(); // Stop the simulation after 5 seconds
					}, 2000); 
				};
				
				// Function to update node sizes based on the slider value
				const updateNodeSizes = () => {
					this.nodeSelection.attr('r', (d: any) => d.id === this.centralNode.id ? this.nodeSize + 3 : this.nodeSize);
				};
				
				const updateNodeLabels = () => {
					this.labelSelection
						.attr('font-size', this.nodeLabelSize) // Update font size for node labels
						.text((d: any) => this.formatLabel(d.name, true)); // Update text based on max label characters
				};
		
				const updateLinkLabelSizes = () => {
					this.linkLabelSelection.attr('font-size', this.linkLabelSize); // Update font size for link labels
				};
		
				const updateNodeLabelSizes = () => {
					console.log('updating node labels', this.nodeLabelSize);
					this.labelSelection.attr('font-size', this.nodeLabelSize);
				};
				

				// Function to debounce calls to updateVisualization
				function debounce(func: Function, wait: number) {
					let timeout: number | undefined;
					return function(...args: any[]) {
						clearTimeout(timeout);
						timeout = window.setTimeout(() => func.apply(this, args), wait);
					};
				}
	
	
				// Event listener for Score Threshold slider
				if (scoreThresholdSlider  && !this.settingsInstantiated) {
					// Immediate update of label text
					scoreThresholdSlider.addEventListener('input', (event) => {
						const newScoreThreshold = parseFloat((event.target as HTMLInputElement).value);
						if (scoreThresholdLabel) {
							scoreThresholdLabel.textContent = `Min Relevance: ${newScoreThreshold}`;
						}
					});
	
					// Debounced updateVisualization function
					const debouncedUpdateVisualization = debounce((event: Event) => {
						const newScoreThreshold = parseFloat((event.target as HTMLInputElement).value);
						updateVisualization(newScoreThreshold);
					}, 500); // Adjust the delay (500ms) as needed
	
					scoreThresholdSlider.addEventListener('input', debouncedUpdateVisualization);
	
					this.settingsInstantiated = true;
				}
	
				// Event listener for Node Size slider
				if (nodeSizeSlider) {
					nodeSizeSlider.addEventListener('input', (event) => {
						const newNodeSize = parseFloat((event.target as HTMLInputElement).value);
						if (nodeSizeLabel) {
							nodeSizeLabel.textContent = `Node Size: ${newNodeSize}`;
						}
						this.nodeSize = newNodeSize;
						updateNodeSizes();
					});
				}
	
				// Event listener for Link Thickness slider
				if (lineThicknessSlider) {
					lineThicknessSlider.addEventListener('input', (event) => {
						console.log('line thicking');
						const newLineThickness = parseFloat((event.target as HTMLInputElement).value);
						this.linkThickness = newLineThickness;
						if (lineThicknessLabel) {
							lineThicknessLabel.textContent = `Line Thickness: ${newLineThickness}`;
						}
						updateLinkThickness();
					});
				}
	
				// Close dropdown menu on X icon click
				const closeIcon = document.getElementById('close-icon');
				if (closeIcon) {
					closeIcon.addEventListener('click', () => {
						console.log('Close icon CLICKED');
	
						dropdownMenu.classList.remove('open');
					});
				}
	
				// Refresh functionality for refresh icon click (optional, implement as needed)
				const refreshIcon = document.getElementById('refresh-icon');
				if (refreshIcon) {
					refreshIcon.addEventListener('click', () => {
						console.log('Refresh icon clicked');
						resetToDefault();
					});
				}
				
	
				// Function to reset all variables to default using the global default constant
				const resetToDefault = () => {
					this.relevanceScoreThreshold = DEFAULT_NETWORK_SETTINGS.scoreThreshold;
					this.nodeSize = DEFAULT_NETWORK_SETTINGS.nodeSize;
					this.linkThickness = DEFAULT_NETWORK_SETTINGS.linkThickness;
					this.repelForce = DEFAULT_NETWORK_SETTINGS.repelForce;
					this.linkForce = DEFAULT_NETWORK_SETTINGS.linkForce;
					this.linkDistance = DEFAULT_NETWORK_SETTINGS.linkDistance;
					this.centerForce = DEFAULT_NETWORK_SETTINGS.centerForce;
	
					// Update slider values
					if (scoreThresholdSlider) scoreThresholdSlider.value = `${this.relevanceScoreThreshold}`;
					if (scoreThresholdLabel) scoreThresholdLabel.textContent = `relevance Threshold: ${this.relevanceScoreThreshold}`;
					if (nodeSizeSlider) nodeSizeSlider.value = `${this.nodeSize}`;
					if (nodeSizeLabel) nodeSizeLabel.textContent = `Node Size: ${this.nodeSize}`;
					if (lineThicknessSlider) lineThicknessSlider.value = `${this.linkThickness}`;
					if (lineThicknessLabel) lineThicknessLabel.textContent = `Line Thickness: ${this.linkThickness}`;
					if (centerForceSlider) centerForceSlider.value = `${this.centerForce}`;
					if (centerForceLabel) centerForceLabel.textContent = `Center Force: ${this.centerForce}`;
					if (repelForceSlider) repelForceSlider.value = `${this.repelForce}`;
					if (repelForceLabel) repelForceLabel.textContent = `Repel Force: ${this.repelForce}`;
					if (linkForceSlider) linkForceSlider.value = `${this.linkForce}`;
					if (linkForceLabel) linkForceLabel.textContent = `Link Force: ${this.linkForce}`;
					if (linkDistanceSlider) linkDistanceSlider.value = `${this.linkDistance}`;
					if (linkDistanceLabel) linkDistanceLabel.textContent = `Link Distance: ${this.linkDistance}`;
					if (fadeThresholdSlider) fadeThresholdSlider.value = `${this.textFadeThreshold}`;
					if (fadeThresholdLabel) fadeThresholdLabel.textContent = `Fade Threshold: ${this.textFadeThreshold}`;
					if (minLinkThicknessSlider) minLinkThicknessSlider.value = `${this.minLinkThickness}`;
					if (minLinkThicknessLabel) minLinkThicknessLabel.textContent = `Min Link Thickness: ${this.minLinkThickness}`;
					if (maxLinkThicknessSlider) maxLinkThicknessSlider.value = `${this.maxLinkThickness}`;
					if (maxLinkThicknessLabel) maxLinkThicknessLabel.textContent = `Max Link Thickness: ${this.maxLinkThickness}`;

					// Reapply settings
					updateNodeSizes();
					updateLinkThickness();
	
					// Update the simulation forces
					simulation
						.force('center', d3.forceCenter(width / 2, height / 2).strength(this.centerForce))
						.force('charge', d3.forceManyBody().strength(-this.repelForce))
						.force('link', d3.forceLink().id((d: any) => d.id).strength(this.linkForce).distance(this.linkDistance));
	
					// Restart the simulation with the new settings
					simulation.alpha(0.3).alphaTarget(0).restart();
					updateVisualization(this.relevanceScoreThreshold);
				};
	
	
			this.settingsInstantiated = true;
	
		}
	
			// Watch for changes in the currently viewed note
			this.app.workspace.on('file-open', (file) => {
				if (file && (this.currentNoteKey !== file.path) && !this.isHovering) {
					// if (!this.updatingVisualization) {
						this.currentNoteKey = file.path;
						console.log('Current Note Key:', this.currentNoteKey);
						updateVisualization();
					// }
				}
			});
		
			// Initial call to create the visualization
			updateVisualization();
	
		}, 1000);

	}

}
/*
	Main Colors
	Menu text: #a3aecb
	HoveredOverNode: #d46ebe
	NormalNode: #926ec9
	centralNode: #7c8594
	Link: #4c7787
	SliderKnob: #f3ee5d
*/
	
export default class ScGraphView extends Plugin {
    settings: ScGraphViewSettings;

    async onload() {
        await this.loadSettings();
        // Register the new view
        this.registerView("Smart Graph View", (leaf: WorkspaceLeaf) => new MyItemView(leaf));

				// Register hover link source
				this.registerHoverLinkSource('Smart Graph', {
					display: 'Smart Graph Hover Link Source',
					defaultMod: true
				});

        // This creates an icon in the left ribbon.
        const ribbonIconEl = this.addRibbonIcon('git-fork', 'Smart Graph', (evt: MouseEvent) => {
            // Called when the user clicks the icon.
            // Create a new leaf in the current workspace
            let leaf = this.app.workspace.getLeaf(true);
    
            // Set the new leaf's view to your custom view
            leaf.setViewState({
                type: "Smart Graph View",
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
                    type: "Smart Graph View",
                    active: true,
                });
            }
        });
        // // This adds an editor command that can perform some operation on the current editor instance
        // this.addCommand({
        //     id: 'sample-editor-command',
        //     name: 'Sample editor command',
        //     callback: () => {
        //         // Create a new leaf in the current workspace
        //         let leaf = this.app.workspace.getLeaf(true);
        
        //         // Set the new leaf's view to your custom view
        //         leaf.setViewState({
        //             type: "Smart Graph View",
        //             active: true,
        //         });
        //     }
        // });

        // This adds a complex command that can check whether the current state of the app allows execution of the command
        this.addCommand({
            id: 'open-sample-modal-complex',
            name: 'Open sample modal (complex)',
            callback: () => {
                // Create a new leaf in the current workspace
                let leaf = this.app.workspace.getLeaf(true);
        
                // Set the new leaf's view to your custom view
                leaf.setViewState({
                    type: "Smart Graph View",
                    active: true,
                });
            }
        });

        // // This adds a settings tab so the user can configure various aspects of the plugin
        // this.addSettingTab(new SampleSettingTab(this.app, this));

				// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
        // Using this function will automatically remove the event listener when this plugin is disabled.
        this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
					// console.log('click', evt);
				});

        // // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
        // this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
    }

    onunload() {}

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

// class SampleSettingTab extends PluginSettingTab {
//     plugin: ScGraphView;

//     constructor(app: App, plugin: ScGraphView) {
//         super(app, plugin);
//         this.plugin = plugin;
//     }

//     display(): void {
//         const {containerEl} = this;

//         containerEl.empty();

//         new Setting(containerEl)
//             .setName('Setting #1')
//             .setDesc('It\'s a secret')
//             .addText(text => text
//                 .setPlaceholder('Enter your secret... This will change everything')
//                 .setValue(this.plugin.settings.mySetting)
//                 .onChange(async (value) => {
//                     this.plugin.settings.mySetting = value;
//                     await this.plugin.saveSettings();
//                 }));
//     }
// }