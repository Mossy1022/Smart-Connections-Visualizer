import { Plugin, ItemView, WorkspaceLeaf, debounce } from 'obsidian';
import * as d3 from "d3";

const DEFAULT_NETWORK_SETTINGS : any = {
	scoreThreshold: 0.5,
	nodeSize: 4,
	linkThickness: 0.3,
	repelForce: 400,
	linkForce: 0.4,
	linkDistance: 70,
	centerForce: 0.1,
	textFadeThreshold: 1.1,
	minLinkThickness: 0.3,
	maxLinkThickness: 0.6,
	maxLabelCharacters: 18,
	linkLabelSize: 7,
	nodeLabelSize: 6,
}

declare global {
    interface Window {
        SmartSearch: any;
    }
}

class ScGraphItemView extends ItemView {
	currentNoteKey: string; 
	centralNote: any;
	centralNode: any;
	connectionType = 'block';
    isHovering: boolean; 
	relevanceScoreThreshold = 0.5;
	nodeSize = 4;
	linkThickness = 0.3;
	repelForce = 400;
	linkForce = 0.4;
	linkDistance = 70;
	centerForce = 0.3;
	textFadeThreshold = 1.1;
	minScore = 1;
	maxScore = 0;
	minNodeSize = 3;
	maxNodeSize = 6;
	minLinkThickness = 0.3;
	maxLinkThickness = 0.6;
	nodeSelection: any;
	linkSelection: any;
	linkLabelSelection: any;
	labelSelection: any;
	updatingVisualization: boolean;
	isCtrlPressed = false;
	isAltPressed = false;
    isDragging = false;
	isChangingConnectionType = true;
    selectionBox: any;
	validatedLinks: any;
	maxLabelCharacters = 18;
	linkLabelSize = 7;
	nodeLabelSize = 6;
	startX = 0;
	startY = 0;
	nodes : any = [];
	links : any = [];
	connections : any = [];
	svgGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
	svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
	centerHighlighted = false;
	simulation: any;
	dragging = false;
	highlightedNodeId = '-1';
	currentNoteChanging = false;
	isFiltering = false;
	

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
		this.currentNoteKey = '';
		this.isHovering = false;
    }

    getViewType(): string {
        return "smart-connections-visualizer";
    }

    getDisplayText(): string {
        return "Smart connections visualizer";
    }

    getIcon(): string {
        return "git-fork";
    }

	updateNodeAppearance() {
		this.nodeSelection.transition().duration(500)
			.attr('fill', (d: any) => this.getNodeFill(d))
			.attr('stroke', (d: any) => d.selected ? 'blanchedalmond' : (d.highlighted ? '#d46ebe' : 'transparent'))
			.attr('stroke-width', (d: any) => d.selected ? 1.5 : (d.highlighted ? 0.3 : 0))
			.attr('opacity', (d: any) => this.getNodeOpacity(d));
	}
	

	getNodeFill(d: any) {
		if (d.id === this.centralNode.id) return '#7c8594';
		if (d.highlighted && !d.selected) return '#d46ebe';
		return d.group === 'note' ? '#7c8594' : '#926ec9';
	}

	getNodeOpacity(d: any) {
		if (d.id === this.centralNode.id) return 1;
		if (d.selected) return 1;
		if (d.highlighted) return 0.8;
		return this.isHovering ? 0.1 : 1;
	}

    toggleNodeSelection(nodeId: string) {
		const node = this.nodeSelection.data().find((d: any) => d.id === nodeId);
		if (node) {
			node.selected = !node.selected;
			if (!node.selected) {
				node.highlighted = false;
			}
			this.updateNodeAppearance();
		}
	}
	

	clearSelections() {
		this.nodeSelection.each((d: any) => {
			d.selected = false;
			d.highlighted = false;
		});
		this.updateNodeAppearance();
	}

	highlightNode(node: any) {
		
        if (node.id === this.centralNode.id) {
            this.centerHighlighted = true;
        }

		this.highlightedNodeId = node.id;

        this.nodeSelection.each((d: any) => {
            if (d.id !== this.centralNode.id) {
                d.highlighted = (d.id === node.id || this.validatedLinks.some((link: any) =>
                    (link.source.id === node.id && link.target.id === d.id) ||
                    (link.target.id === node.id && link.source.id === d.id)));
            }
        });
        this.updateNodeAppearance();
        this.updateLinkAppearance(node);
        this.updateLabelAppearance(node);
        this.updateLinkLabelAppearance(node);
    }
	
	
	updateHighlight(d: any, node: any) {
		if (d.id !== this.centralNode.id) {
			d.highlighted = (d.id === node.id || this.validatedLinks.some((link: any) =>
				(link.source.id === node.id && link.target.id === d.id) ||
				(link.target.id === node.id && link.source.id === d.id)));
		}
	}

	updateLinkAppearance(node: any) {
		this.linkSelection.transition().duration(500)
			.attr('opacity', (d: any) => (d.source.id === node.id || d.target.id === node.id) ? 1 : 0.1);
	}

	updateLabelAppearance(node: any) {
		this.labelSelection.transition().duration(500)
			.attr('opacity', (d: any) => this.getLabelOpacity(d, node))
			.text((d: any) =>  d.id === this.highlightedNodeId ? this.formatLabel(d.name, false) : this.formatLabel(d.name, true));
	}
	
	getLabelOpacity(d: any, node: any) {
		if (!node) {
			return 1; // Reset to full opacity if no node is highlighted
		}
		return (d.id === node.id || this.validatedLinks.some((link: any) =>
			(link.source.id === node.id && link.target.id === d.id)) || d.id == this.centralNode.id) ? 1 : 0.1;
	}
	
	updateLinkLabelAppearance(node: any) {
		this.linkLabelSelection.transition().duration(500)
		.attr('opacity', (d: any) => {
			return (d.source.id === node.id || d.target.id === node.id) ? 1 : 0;
		})
	}
	

	unhighlightNode(node : any) {

		// Reset highlighted nodeid
		this.highlightedNodeId = '-1';

        this.nodeSelection.each((d: any) => {
            if (d.id !== this.centralNode.id) d.highlighted = false;
        });

        this.updateNodeAppearance();
        this.resetLinkAppearance();
        this.resetLabelAppearance();
        this.resetLinkLabelAppearance();
        this.updateLabelAppearance(null); // Pass false to reset label position
    }
	

	resetLinkAppearance() {
		this.linkSelection.transition().duration(500).attr('opacity', 1);
	}

	resetLabelAppearance() {
		this.labelSelection.transition().duration(500).attr('opacity', 1)
			.text((d: any) => this.formatLabel(d.name, true));
	}

	resetLinkLabelAppearance() {
		this.linkLabelSelection.transition().duration(500).attr('opacity', 0);
	}

	formatLabel(path: string, truncate: boolean = true) {
		let label = this.extractLabel(path);
		return truncate ? this.truncateLabel(label) : label;
	}

	extractLabel(path: string) {
		let label = path;

		// Remove the anchor part if it exists
		if (path && path.includes('#')) {
			const parts = path.split('#');
			label = parts[parts.length - 1]; // Take the last part after splitting by '#'
		} else if (path) {
			label = path.split('/').pop() || label; // Take the last part after splitting by '/'
		} else {
			return '';
		}
	
		// Remove brackets if they exist
		label = label.replace(/[\[\]]/g, '');
	
		// Remove file extension if it exists
		label = label.replace(/\.[^/.]+$/, '');
	
		return label;
		
	}

	truncateLabel(label: string) {
		return label.length > this.maxLabelCharacters ? label.slice(0, this.maxLabelCharacters) + '...' : label;
	}

	get env() { return window.SmartSearch?.main?.env; }
	get smartNotes() { return window.SmartSearch?.main?.env?.smart_notes?.items; }
	

	async onOpen() {
		this.contentEl.createEl('h2', { text: 'Smart Visualizer' });
		this.contentEl.createEl('p', { text: 'Waiting for Smart Connections to load...' });
		console.log(this.app);

		this.render();
	}

	async render() {
		// wait until this.smartNotes is available
		while (!this.env?.entities_loaded) {
			await new Promise(resolve => setTimeout(resolve, 2000));
		}
		this.contentEl.empty();
		this.initializeVariables();
		if (Object.keys(this.smartNotes).length === 0) {
			return;
		}
		this.setupSVG();
		this.addEventListeners();
		this.setupSettingsMenu();
		this.watchForNoteChanges();
		
		this.updateVisualization();
	}

	async waitForSmartNotes() {
		const maxRetries = 10; // Set a max number of retries to avoid infinite loop
		const delay = 2000; // Delay in milliseconds between retries
	
		for (let attempt = 0; attempt < maxRetries; attempt++) {
			console.log(this.env);
			if (this.env?.entities_loaded) {
				return;
			}
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	
		// If we reach here, it means the entities are still not loaded
		console.error('Smart notes did not load in time');
		this.contentEl.createEl('p', { text: 'Failed to load Smart Connections.' });
	}

	initializeVariables() {
		this.minScore = 1;
		this.maxScore = 0;
	}

	setupSVG() {
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
					this.updateLabelOpacity(event.transform.k);
				}));
				
		const svgGroup = svg.append('g');
	
		svgGroup.append('g').attr('class', 'links');
		svgGroup.append('g').attr('class', 'node-labels');
		svgGroup.append('g').attr('class', 'link-labels');
		svgGroup.append('g').attr('class', 'nodes');
	
		this.svgGroup = svgGroup;
		this.svg = svg;
	}
	

	getSVGDimensions() {
		const width = this.contentEl.clientWidth || this.contentEl.getBoundingClientRect().width;
		const height = this.contentEl.clientHeight || this.contentEl.getBoundingClientRect().height;
		return { width, height };
	}
	

	createSVG(width: number, height: number) {
		return d3.select(this.contentEl)
			.append('svg')
			.attr('width', '100%')
			.attr('height', '98%')
			.attr('viewBox', `0 0 ${width} ${height}`)
			.attr('preserveAspectRatio', 'xMidYMid meet')
			.style('background', '#2d3039')
			.call(d3.zoom().scaleExtent([0.1, 10]).on('zoom', this.onZoom.bind(this)));
	}

	createSVGGroup(svg: any) {
		return svg.append('g');
	}

	onZoom(event: any) {
		d3.select('g').attr('transform', event.transform);
		this.updateLabelOpacity(event.transform.k);
	}

	initializeSimulation(width: number, height: number) {
		this.simulation = d3.forceSimulation()
			.force('center', d3.forceCenter(width / 2, height / 2).strength(this.centerForce))
			.force('charge', d3.forceManyBody().strength(-this.repelForce))
			// .force('link', d3.forceLink().id((d: any) => d.id).distance(this.linkDistance).strength(this.linkForce))
			.force('link', d3.forceLink()
                .id((d: any) => d.id)
                .distance((d: any) => this.linkDistanceScale(d.score))
                .strength(this.linkForce))
			.force('collide', d3.forceCollide().radius(this.nodeSize + 3).strength(0.7))
			.on('tick', this.simulationTickHandler.bind(this));

		 // Add the custom force for labels
		  this.simulation.force('labels', this.avoidLabelCollisions.bind(this));

		// Disable the centering force after the initial positioning
		// this.simulation.on('end', () => {
		// 	console.log('Simulation ended, center force removed.');
		// 	this.simulation.force('center', null); // Remove the center force after initial stabilization
		// });

	}

	// Ensure node labels dont collide with any elements
	avoidLabelCollisions() {
		const padding = 5; // Adjust padding as needed
		return (alpha: number) => {
			const quadtree = d3.quadtree()
				.x((d: any) => d.x)
				.y((d: any) => d.y)
				.addAll(this.labelSelection.data());
	
			this.labelSelection.each((d: any) => {
				const radius = d.radius + padding; // Assuming each label has a radius, adjust as necessary
				const nx1 = d.x - radius, nx2 = d.x + radius, ny1 = d.y - radius, ny2 = d.y + radius;
	
				quadtree.visit((quad, x1, y1, x2, y2) => {
					if ('data' in quad && quad.data && (quad.data !== d)) {						
						let x = d.x - (quad.data as any).x,
							y = d.y - (quad.data as any).y,
							l = Math.sqrt(x * x + y * y),
							r = radius + (quad.data as any).radius;
						if (l < r) {
							l = (l - r) / l * alpha;
							d.x -= x *= l;
							d.y -= y *= l;
							(quad.data as any).x += x;
							(quad.data as any).y += y;
						}
					}
					return x1 > nx2 || x2 < nx1 || y1 > ny2 || y2 < ny1;
				});
			});
		};
	}
	

	createNodes(svgGroup: any) {
		return svgGroup.append('g')
			.attr('class', 'nodes')
			.selectAll('circle')
			.data([])
			.enter().append('circle')
			.attr('r', 20)
			.attr('fill', 'blue')
			.style('cursor', 'pointer') // Ensure cursor is pointer
			.style('pointer-events', 'all') // Ensure nodes can capture pointer events
			.call(d3.drag().on('start', this.onDragStart.bind(this))
				.on('drag', this.onDrag.bind(this))
				.on('end', this.onDragEnd.bind(this)));
	}

	createLinks(svgGroup: any) {
		return svgGroup.append('g')
			.attr('class', 'links')
			.selectAll('line')
			.data([])
			.enter().append('line')
			.attr('stroke', 'blue')
			.attr('stroke-width', 2)
			.attr('stroke-opacity', 1);
	}

	addEventListeners() {
		this.setupSVGEventListeners();
		this.setupKeyboardEventListeners();
	}

	setupSVGEventListeners() {
		d3.select('svg')
			.on('mousedown', this.onMouseDown.bind(this))
			.on('mousemove', this.onMouseMove.bind(this))
			.on('mouseup', this.onMouseUp.bind(this))
			.on('click', this.onSVGClick.bind(this));
	}

	// TODO: Add back in when ready for multiselect
	onMouseDown(event: any) {
		// if (!event.ctrlKey) this.clearSelections();
		// this.startBoxSelection(event);
	}

	onMouseMove(event: any) {
		// event.stopPropagation();
		// this.updateBoxSelection(event);
	}

	onMouseUp() {
		// this.endBoxSelection();
	}

	onSVGClick(event: any) {
		if (!event.defaultPrevented && !event.ctrlKey) this.clearSelections();
	}

	setupKeyboardEventListeners() {
		document.addEventListener('keydown', this.onKeyDown.bind(this));
		document.addEventListener('keyup', this.onKeyUp.bind(this));
	}

	onKeyDown(event: any) {
		if (event.key === 'Alt' || event.key === 'AltGraph') this.isAltPressed = true;
		if (event.key === 'Control') {
			this.isCtrlPressed = true;
			d3.select('svg').style('cursor', 'crosshair');
		}
	}

	onKeyUp(event: any) {
		if (event.key === 'Alt' || event.key === 'AltGraph') this.isAltPressed = false;
		if (event.key === 'Control') {
			this.isCtrlPressed = false;
			d3.select('svg').style('cursor', 'default');
		}
	}

	setupSettingsMenu() {
		if (!document.querySelector('.settings-icon')) {
			this.createSettingsIcon();
			this.createDropdownMenu();
			this.setupAccordionHeaders();
			this.setupSettingsEventListeners();
		}
	}

	createDropdownMenu() {
		const dropdownMenu = this.contentEl.createEl('div', { cls: 'dropdown-menu' });
		this.buildDropdownMenuContent(dropdownMenu);
	}

	buildDropdownMenuContent(dropdownMenu: HTMLElement) {
		const menuHeader = dropdownMenu.createEl('div', { cls: 'menu-header' });
		
		// Append the refresh icon created by createRefreshIcon
		const refreshIcon = this.createRefreshIcon();
		refreshIcon.classList.add('icon'); // Ensure it has the 'icon' class for styling
		refreshIcon.setAttribute('id', 'refresh-icon'); // Set the ID for specific styling or selection
		menuHeader.appendChild(refreshIcon);	
		
		// Append the new X icon created by createNewXIcon
		const xIcon = this.createNewXIcon();
		xIcon.classList.add('icon'); // Ensure it has the 'icon' class for styling
		xIcon.setAttribute('id', 'close-icon'); // Set the ID for specific styling or selection
		menuHeader.appendChild(xIcon);
  
		this.addAccordionItem(dropdownMenu, 'Filters', this.getFiltersContent.bind(this));
		this.addAccordionItem(dropdownMenu, 'Display', this.getDisplayContent.bind(this));
		this.addAccordionItem(dropdownMenu, 'Forces', this.getForcesContent.bind(this));
	}
	
	
	addAccordionItem(parent: HTMLElement, title: string, buildContent: (parent: HTMLElement) => void) {
		const accordionItem = parent.createEl('div', { cls: 'accordion-item' });
		const header = accordionItem.createEl('div', { cls: 'accordion-header' });
	
		const arrowIcon = header.createEl('span', { cls: 'arrow-icon' });
		arrowIcon.appendChild(this.createRightArrow());
	
		header.createEl('span', { text: title });
	
		const accordionContent = accordionItem.createEl('div', { cls: 'accordion-content' });
		buildContent(accordionContent);
	}
	
	getFiltersContent(parent: HTMLElement) {
		const sliderContainer1 = parent.createEl('div', { cls: 'slider-container' });
		sliderContainer1.createEl('label', { 
			text: `Min relevance: ${(this.relevanceScoreThreshold * 100).toFixed(0)}%`, 
			attr: { id: 'scoreThresholdLabel', for: 'scoreThreshold' } 
		});

		const relevanceSlider = sliderContainer1.createEl('input', { 
			attr: { 
				type: 'range', 
				id: 'scoreThreshold', 
				class: 'slider', 
				name: 'scoreThreshold', 
				min: '0', 
				max: '0.99', 
				step: '0.01' 
			} 
		});

		// Ensure the slider's value is set after it is appended to the DOM
		relevanceSlider.value = this.relevanceScoreThreshold.toString();
	
		parent.createEl('label', { text: 'Connection type:', cls: 'settings-item-content-label' });
	
		const radioContainer = parent.createEl('div', { cls: 'radio-container' });

		const radioBlockLabel = radioContainer.createEl('label');
		const blockRadio = radioBlockLabel.createEl('input', { 
			attr: { 
				type: 'radio', 
				name: 'connectionType', 
				value: 'block' 
			} 
		});
		blockRadio.checked = (this.connectionType === 'block'); // Set checked based on connectionType
		radioBlockLabel.appendText(' Block');
	
		const radioNoteLabel = radioContainer.createEl('label');
		const noteRadio = radioNoteLabel.createEl('input', { 
			attr: { 
				type: 'radio', 
				name: 'connectionType', 
				value: 'note' 
			} 
		});
		noteRadio.checked = (this.connectionType === 'note'); // Set checked based on connectionType
		radioNoteLabel.appendText(' Note');
	}
	

	getDisplayContent(parent: HTMLElement) {
		const displaySettings = [
			{ id: 'nodeSize', label: 'Node size', value: this.nodeSize, min: 1, max: 15, step: 0.01 },
			{ id: 'maxLabelCharacters', label: 'Max label characters', value: this.maxLabelCharacters, min: 1, max: 50, step: 1 },
			{ id: 'linkLabelSize', label: 'Link label size', value: this.linkLabelSize, min: 1, max: 15, step: 0.01 },
			{ id: 'nodeLabelSize', label: 'Node label size', value: this.nodeLabelSize, min: 1, max: 26, step: 1 },
			{ id: 'minLinkThickness', label: 'Min link thickness', value: this.minLinkThickness, min: 0.1, max: 10, step: 0.01 },
			{ id: 'maxLinkThickness', label: 'Max link thickness', value: this.maxLinkThickness, min: 0.1, max: 10, step: 0.01 },
			{ id: 'fadeThreshold', label: 'Text fade threshold', value: this.textFadeThreshold, min: 0.1, max: 10, step: 0.01 }
		];
	
		displaySettings.forEach(setting => {
			const sliderContainer = parent.createEl('div', { cls: 'slider-container' });
			sliderContainer.createEl('label', { text: `${setting.label}: ${setting.value}`, attr: { id: `${setting.id}Label`, for: setting.id } });
			sliderContainer.createEl('input', { attr: { type: 'range', id: setting.id, class: 'slider', name: setting.id, min: `${setting.min}`, max: `${setting.max}`, value: `${setting.value}`, step: `${setting.step}` } });
		});
	}
	

	getForcesContent(parent: HTMLElement) {
		const forcesSettings = [
			{ id: 'repelForce', label: 'Repel force', value: this.repelForce, min: 0, max: 1500, step: 1 },
			{ id: 'linkForce', label: 'Link force', value: this.linkForce, min: 0, max: 1, step: 0.01 },
			{ id: 'linkDistance', label: 'Link distance', value: this.linkDistance, min: 10, max: 200, step: 1 }
		];
	
		forcesSettings.forEach(setting => {
			const sliderContainer = parent.createEl('div', { cls: 'slider-container' });
			sliderContainer.createEl('label', { text: `${setting.label}: ${setting.value}`, attr: { id: `${setting.id}Label`, for: setting.id } });
			sliderContainer.createEl('input', { attr: { type: 'range', id: setting.id, class: 'slider', name: setting.id, min: `${setting.min}`, max: `${setting.max}`, value: `${setting.value}`, step: `${setting.step}` } });
		});
	}
	
	toggleDropdownMenu() {
		const dropdownMenu = document.querySelector('.dropdown-menu') as HTMLElement;
	
		if (dropdownMenu) {
	
			dropdownMenu.classList.toggle('visible');
	
		} else {
			console.error('Dropdown menu element not found');
		}
	}
	

	setupAccordionHeaders() {
		const accordionHeaders = document.querySelectorAll('.accordion-header');
		accordionHeaders.forEach(header => header.addEventListener('click', this.toggleAccordionContent.bind(this)));
	}

	toggleAccordionContent(event: any) {
		const content = event.currentTarget.nextElementSibling;
		const arrowIcon = event.currentTarget.querySelector('.arrow-icon');
		if (content && arrowIcon) {
			content.classList.toggle('show');
			arrowIcon.innerHTML = ''; // Clear current content
			arrowIcon.appendChild(content.classList.contains('show') ? this.createDropdownArrow() : this.createRightArrow());
		}
	}
	
	createDropdownArrow() {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("class", "dropdown-indicator");
		svg.setAttribute("viewBox", "0 0 16 16");
		svg.setAttribute("fill", "currentColor");
	
		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("fill-rule", "evenodd");
		path.setAttribute("d", "M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z");
	
		svg.appendChild(path);
		return svg;
	}
	
	createRightArrow() {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("class", "dropdown-indicator");
		svg.setAttribute("viewBox", "0 0 16 16");
		svg.setAttribute("fill", "currentColor");
	
		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("fill-rule", "evenodd");
		path.setAttribute("d", "M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z");
	
		svg.appendChild(path);
		return svg;
	}

	createSettingsIcon() {
		// Create the container div for the settings icon
		const settingsIcon = this.contentEl.createEl('div', {
			cls: ['settings-icon', ],
			attr: { 'aria-label': 'Open graph settings' }
		});
	
		// Create SVG element for settings icon
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "24");
		svg.setAttribute("height", "24");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "2");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
		svg.setAttribute("class", "svg-icon lucide-settings");
	
		// Create path element for settings icon
		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("d", "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z");
		svg.appendChild(path);
	
		// Create circle element for settings icon
		const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
		circle.setAttribute("cx", "12");
		circle.setAttribute("cy", "12");
		circle.setAttribute("r", "3");
		svg.appendChild(circle);
	
		// Append SVG to settings icon container
		settingsIcon.appendChild(svg);
	
		settingsIcon.addEventListener('click', this.toggleDropdownMenu);
	}

	createRefreshIcon() {
		const refreshIcon = this.contentEl.createEl('div', { cls: 'refresh-icon' });
	
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "24");
		svg.setAttribute("height", "24");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "2");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
		svg.setAttribute("class", "svg-icon lucide-rotate-ccw");
	
		const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path1.setAttribute("d", "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8");
		svg.appendChild(path1);
	
		const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path2.setAttribute("d", "M3 3v5h5");
		svg.appendChild(path2);
	
		refreshIcon.appendChild(svg);
	
		return refreshIcon; // Return the complete icon element
	}

	createNewXIcon() {
		const xIcon = this.contentEl.createEl('div', { cls: 'x-icon' });
	
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "24");
		svg.setAttribute("height", "24");
		svg.setAttribute("viewBox", "0 0 24 24");
		svg.setAttribute("fill", "none");
		svg.setAttribute("stroke", "currentColor");
		svg.setAttribute("stroke-width", "2");
		svg.setAttribute("stroke-linecap", "round");
		svg.setAttribute("stroke-linejoin", "round");
		svg.setAttribute("class", "svg-icon lucide-x");
	
		const path1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path1.setAttribute("d", "M18 6 6 18");
		svg.appendChild(path1);
	
		const path2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path2.setAttribute("d", "m6 6 12 12");
		svg.appendChild(path2);
	
		xIcon.appendChild(svg);
	
		return xIcon; // Return the complete icon element
	}

	setupSettingsEventListeners() {
		this.setupScoreThresholdSlider();
		this.setupNodeSizeSlider();
		this.setupLineThicknessSlider();
		this.setupCenterForceSlider();
		this.setupRepelForceSlider();
		this.setupLinkForceSlider();
		this.setupLinkDistanceSlider();
		this.setupFadeThresholdSlider();
		this.setupMinLinkThicknessSlider();
		this.setupMaxLinkThicknessSlider();
		this.setupConnectionTypeRadios();
		this.setupMaxLabelCharactersSlider();
		this.setupLinkLabelSizeSlider();
		this.setupNodeLabelSizeSlider();
		this.setupCloseIcon();
		this.setupRefreshIcon();
	}

	setupScoreThresholdSlider() {
		const scoreThresholdSlider = document.getElementById('scoreThreshold') as HTMLInputElement;
		if (scoreThresholdSlider) {
			scoreThresholdSlider.addEventListener('input', (event) => this.updateScoreThreshold(event));
			const debouncedUpdate = debounce((event: Event) => {
				this.updateVisualization(parseFloat((event.target as HTMLInputElement).value));
			}, 500, true);			
			scoreThresholdSlider.addEventListener('input', debouncedUpdate);
		}
	}

	updateScoreThreshold(event: any) {
		const newScoreThreshold = parseFloat(event.target.value);
		const label = document.getElementById('scoreThresholdLabel');
		if (label) label.textContent = `Min Relevance: ${(newScoreThreshold * 100).toFixed(0)}%`;
	}

	setupNodeSizeSlider() {
		const nodeSizeSlider = document.getElementById('nodeSize') as HTMLInputElement;
		if (nodeSizeSlider) {
			nodeSizeSlider.addEventListener('input', (event) => this.updateNodeSize(event));
		}
	}

	updateNodeSize(event: any) {
		const newNodeSize = parseFloat(event.target.value);
		const label = document.getElementById('nodeSizeLabel');
		if (label) label.textContent = `Node Size: ${newNodeSize}`;
		this.nodeSize = newNodeSize;
		this.updateNodeSizes();
	}

	setupLineThicknessSlider() {
		const lineThicknessSlider = document.getElementById('lineThickness') as HTMLInputElement;
		if (lineThicknessSlider) {
			lineThicknessSlider.addEventListener('input', (event) => this.updateLineThickness(event));
		}
	}

	updateLineThickness(event: any) {
		const newLineThickness = parseFloat(event.target.value);
		const label = document.getElementById('lineThicknessLabel');
		if (label) label.textContent = `Line Thickness: ${newLineThickness}`;
		this.linkThickness = newLineThickness;
		this.updateLinkThickness();
	}

	setupCenterForceSlider() {
		const centerForceSlider = document.getElementById('centerForce') as HTMLInputElement;
		if (centerForceSlider) {
			centerForceSlider.addEventListener('input', (event) => this.updateCenterForce(event));
		}
	}

	updateCenterForce(event: any) {
		const newCenterForce = parseFloat(event.target.value);
		const label = document.getElementById('centerForceLabel');
		if (label) label.textContent = `Center Force: ${newCenterForce}`;
		this.centerForce = newCenterForce;
		this.updateSimulationForces();
	}

	setupRepelForceSlider() {
		const repelForceSlider = document.getElementById('repelForce') as HTMLInputElement;
		if (repelForceSlider) {
			repelForceSlider.addEventListener('input', (event) => this.updateRepelForce(event));
		}
	}

	updateRepelForce(event: any) {
		const newRepelForce = parseFloat(event.target.value);
		const label = document.getElementById('repelForceLabel');
		if (label) label.textContent = `Repel Force: ${newRepelForce}`;
		this.repelForce = newRepelForce;
		this.updateSimulationForces();
	}

	setupLinkForceSlider() {
		const linkForceSlider = document.getElementById('linkForce') as HTMLInputElement;
		if (linkForceSlider) {
			linkForceSlider.addEventListener('input', (event) => this.updateLinkForce(event));
		}
	}

	updateLinkForce(event: any) {
		const newLinkForce = parseFloat(event.target.value);
		const label = document.getElementById('linkForceLabel');
		if (label) label.textContent = `Link Force: ${newLinkForce}`;
		this.linkForce = newLinkForce;
		this.updateSimulationForces();
	}

	setupLinkDistanceSlider() {
		const linkDistanceSlider = document.getElementById('linkDistance') as HTMLInputElement;
		if (linkDistanceSlider) {
			linkDistanceSlider.addEventListener('input', (event) => this.updateLinkDistance(event));
		}
	}

	updateLinkDistance(event: any) {
		const newLinkDistance = parseFloat(event.target.value);
		const label = document.getElementById('linkDistanceLabel');
		if (label) label.textContent = `Link Distance: ${newLinkDistance}`;
		this.linkDistance = newLinkDistance;
		this.updateSimulationForces();
	}

	setupFadeThresholdSlider() {
		const fadeThresholdSlider = document.getElementById('fadeThreshold') as HTMLInputElement;
		if (fadeThresholdSlider) {
			fadeThresholdSlider.addEventListener('input', (event) => {
				this.updateFadeThreshold(event);
				this.updateLabelOpacity(d3.zoomTransform(d3.select('svg').node() as Element).k);
			});
		}
	}

	updateFadeThreshold(event: any) {
		const newFadeThreshold = parseFloat(event.target.value);
		const label = document.getElementById('fadeThresholdLabel');
		if (label) label.textContent = `Text Fade Threshold: ${newFadeThreshold}`;
		this.textFadeThreshold = newFadeThreshold;
	}

	setupMinLinkThicknessSlider() {
		const minLinkThicknessSlider = document.getElementById('minLinkThickness') as HTMLInputElement;
		if (minLinkThicknessSlider) {
			minLinkThicknessSlider.addEventListener('input', (event) => this.updateMinLinkThickness(event));
		}
	}

	updateMinLinkThickness(event: any) {
		const newMinLinkThickness = parseFloat(event.target.value);
		const label = document.getElementById('minLinkThicknessLabel');
		if (label) label.textContent = `Min Link Thickness: ${newMinLinkThickness}`;
		this.minLinkThickness = newMinLinkThickness;
		this.updateLinkThickness();
	}

	setupMaxLinkThicknessSlider() {
		const maxLinkThicknessSlider = document.getElementById('maxLinkThickness') as HTMLInputElement;
		if (maxLinkThicknessSlider) {
			maxLinkThicknessSlider.addEventListener('input', (event) => this.updateMaxLinkThickness(event));
		}
	}

	updateMaxLinkThickness(event: any) {
		const newMaxLinkThickness = parseFloat(event.target.value);
		const label = document.getElementById('maxLinkThicknessLabel');
		if (label) label.textContent = `Max Link Thickness: ${newMaxLinkThickness}`;
		this.maxLinkThickness = newMaxLinkThickness;
		this.updateLinkThickness();
	}

	setupConnectionTypeRadios() {
		const connectionTypeRadios = document.querySelectorAll('input[name="connectionType"]');
		connectionTypeRadios.forEach(radio => radio.addEventListener('change', (event) => this.updateConnectionType(event)));
	}

	updateConnectionType(event: any) {
		this.connectionType = event.target.value;
		this.isChangingConnectionType = true;
		this.updateVisualization();
	}

	setupMaxLabelCharactersSlider() {
		const maxLabelCharactersSlider = document.getElementById('maxLabelCharacters') as HTMLInputElement;
		if (maxLabelCharactersSlider) {
			maxLabelCharactersSlider.addEventListener('input', (event) => this.updateMaxLabelCharacters(event));
		}
	}

	updateMaxLabelCharacters(event: any) {
		const newMaxLabelCharacters = parseInt(event.target.value, 10);
		const label = document.getElementById('maxLabelCharactersLabel');
		if (label) label.textContent = `Max Label Characters: ${newMaxLabelCharacters}`;
		this.maxLabelCharacters = newMaxLabelCharacters;
		this.updateNodeLabels();
	}

	setupLinkLabelSizeSlider() {
		const linkLabelSizeSlider = document.getElementById('linkLabelSize') as HTMLInputElement;
		if (linkLabelSizeSlider) {
			linkLabelSizeSlider.addEventListener('input', (event) => this.updateLinkLabelSize(event));
		}
	}

	updateLinkLabelSize(event: any) {
		const newLinkLabelSize = parseFloat(event.target.value);
		const label = document.getElementById('linkLabelSizeLabel');
		if (label) label.textContent = `Link Label Size: ${newLinkLabelSize}`;
		this.linkLabelSize = newLinkLabelSize;
		this.updateLinkLabelSizes();
	}

	setupNodeLabelSizeSlider() {
		const nodeLabelSizeSlider = document.getElementById('nodeLabelSize') as HTMLInputElement;
		if (nodeLabelSizeSlider) {
			nodeLabelSizeSlider.addEventListener('input', (event) => this.updateNodeLabelSize(event));
		}
	}

	updateNodeLabelSize(event: any) {
		const newNodeLabelSize = parseFloat(event.target.value);
		const label = document.getElementById('nodeLabelSizeLabel');
		if (label) label.textContent = `Node Label Size: ${newNodeLabelSize}`;
		this.nodeLabelSize = newNodeLabelSize;
		this.updateNodeLabelSizes();
	}

	// Updated setupCloseIcon method
	setupCloseIcon() {
		const closeIcon = document.getElementById('close-icon');
		if (closeIcon) closeIcon.addEventListener('click', () => this.toggleDropdownMenu());
	}

	closeDropdownMenu() {
		const dropdownMenu = document.querySelector('.dropdown-menu');
		if (dropdownMenu) dropdownMenu.classList.remove('open');
	}

	setupRefreshIcon() {
		const refreshIcon = document.getElementById('refresh-icon');
		if (refreshIcon) refreshIcon.addEventListener('click', () => this.resetToDefault());
	}

	resetToDefault() {
		this.relevanceScoreThreshold = DEFAULT_NETWORK_SETTINGS.scoreThreshold;
		this.nodeSize = DEFAULT_NETWORK_SETTINGS.nodeSize;
		this.linkThickness = DEFAULT_NETWORK_SETTINGS.lineThickness;
		this.repelForce = DEFAULT_NETWORK_SETTINGS.repelForce;
		this.linkForce = DEFAULT_NETWORK_SETTINGS.linkForce;
		this.linkDistance = DEFAULT_NETWORK_SETTINGS.linkDistance;
		this.centerForce = DEFAULT_NETWORK_SETTINGS.centerForce;
		this.textFadeThreshold = DEFAULT_NETWORK_SETTINGS.textFadeThreshold;
		this.minLinkThickness = DEFAULT_NETWORK_SETTINGS.minLinkThickness;
		this.maxLinkThickness = DEFAULT_NETWORK_SETTINGS.maxLinkThickness;
		this.maxLabelCharacters = DEFAULT_NETWORK_SETTINGS.maxLabelCharacters;
		this.linkLabelSize = DEFAULT_NETWORK_SETTINGS.linkLabelSize;
		this.nodeLabelSize = DEFAULT_NETWORK_SETTINGS.nodeLabelSize;
		this.updateLabelsToDefaults();
		this.updateSliders();
		this.updateNodeSizes();
		this.updateLinkThickness();
		this.updateSimulationForces();
		this.updateVisualization(this.relevanceScoreThreshold);
	}

	updateLabelsToDefaults() {
		const labels = {
			'scoreThresholdLabel': `Min Relevance: ${(this.relevanceScoreThreshold * 100).toFixed(0)}%`,
			'nodeSizeLabel': `Node Size: ${this.nodeSize}`,
			'maxLabelCharactersLabel': `Max Label Characters: ${this.maxLabelCharacters}`,
			'linkLabelSizeLabel': `Link Label Size: ${this.linkLabelSize}`,
			'nodeLabelSizeLabel': `Node Label Size: ${this.nodeLabelSize}`,
			'minLinkThicknessLabel': `Min Link Thickness: ${this.minLinkThickness}`,
			'maxLinkThicknessLabel': `Max Link Thickness: ${this.maxLinkThickness}`,
			'fadeThresholdLabel': `Text Fade Threshold: ${this.textFadeThreshold}`,
			'repelForceLabel': `Repel Force: ${this.repelForce}`,
			'linkForceLabel': `Link Force: ${this.linkForce}`,
			'linkDistanceLabel': `Link Distance: ${this.linkDistance}`
		};
	
		for (const [id, text] of Object.entries(labels)) {
			const label = document.getElementById(id);
			if (label) {
				label.textContent = text;
			}
		}
	}

	updateSliders() {
		const scoreThresholdSlider = document.getElementById('scoreThreshold') as HTMLInputElement;
		const nodeSizeSlider = document.getElementById('nodeSize') as HTMLInputElement;
		// const lineThicknessSlider = document.getElementById('lineThickness') as HTMLInputElement;
		// const centerForceSlider = document.getElementById('centerForce') as HTMLInputElement;
		const repelForceSlider = document.getElementById('repelForce') as HTMLInputElement;
		const linkForceSlider = document.getElementById('linkForce') as HTMLInputElement;
		const linkDistanceSlider = document.getElementById('linkDistance') as HTMLInputElement;
		const fadeThresholdSlider = document.getElementById('fadeThreshold') as HTMLInputElement;
		const minLinkThicknessSlider = document.getElementById('minLinkThickness') as HTMLInputElement;
		const maxLinkThicknessSlider = document.getElementById('maxLinkThickness') as HTMLInputElement;
		const maxLabelCharactersSlider = document.getElementById('maxLabelCharacters') as HTMLInputElement;
		const linkLabelSizeSlider = document.getElementById('linkLabelSize') as HTMLInputElement;
		const nodeLabelSizeSlider = document.getElementById('nodeLabelSize') as HTMLInputElement;
		
		scoreThresholdSlider.value = `${this.relevanceScoreThreshold}`;
		nodeSizeSlider.value = `${this.nodeSize}`;
		// lineThicknessSlider.value = `${this.linkThickness}`;
		// centerForceSlider.value = `${this.centerForce}`;
		repelForceSlider.value = `${this.repelForce}`;
		linkForceSlider.value = `${this.linkForce}`;
		linkDistanceSlider.value = `${this.linkDistance}`;
		fadeThresholdSlider.value = `${this.textFadeThreshold}`;
		minLinkThicknessSlider.value = `${this.minLinkThickness}`;
		maxLinkThicknessSlider.value = `${this.maxLinkThickness}`;
		maxLabelCharactersSlider.value = `${this.maxLabelCharacters}`;
		linkLabelSizeSlider.value = `${this.linkLabelSize}`;
		nodeLabelSizeSlider.value = `${this.nodeLabelSize}`;
	}

	watchForNoteChanges() {
		this.app.workspace.on('file-open', (file) => {
			if (file && (this.currentNoteKey !== file.path) && !this.isHovering) {
				this.currentNoteKey = file.path;
				this.currentNoteChanging = true;
				this.render();
			}
		});
	}

	updateVisualization(newScoreThreshold?: number) {
		if (this.updatingVisualization && !this.isChangingConnectionType) {
			this.updatingVisualization = false;
			this.currentNoteChanging = false;
			return;
		}
		this.isChangingConnectionType = false;
	
		if (newScoreThreshold !== undefined) {
			this.relevanceScoreThreshold = newScoreThreshold;
		}
	
		this.updateConnections();
		const filteredConnections = this.connections.filter((connection: any) => connection.score >= this.relevanceScoreThreshold);
		const visibleNodes = new Set<string>();
		filteredConnections.forEach((connection: any) => {
			visibleNodes.add(connection.source);
			visibleNodes.add(connection.target);
		});
		// Always include the central node
		visibleNodes.add(this.centralNote.key);
		const nodesData = Array.from(visibleNodes).map((id: any) => {
			const node = this.nodes.find((node: any) => node.id === id);
			return node ? node : null;
		}).filter(Boolean);

		 // Ensure the central node is included in nodesData
		 if (!nodesData.some((node: any) => node.id === this.centralNote.key)) {
			const centralNode = this.nodes.find((node: any) => node.id === this.centralNote.key);
			if (centralNode) {
				nodesData.push(centralNode);
			}
		}

		 // Check and initialize node positions
		 nodesData.forEach((node: any) => {

			if (!node.x || !node.y) {
				console.log('hello');
				console.warn(`Node with invalid position: ${node.id}`);
				node.x = Math.random() * 1000; // or some default value
				node.y = Math.random() * 1000; // or some default value
			}
		});


	
		this.validatedLinks = filteredConnections.filter((link: any) => {
			const sourceNode = nodesData.find((node: any) => node.id === link.source);
			const targetNode = nodesData.find((node: any) => node.id === link.target);
			if (!sourceNode || !targetNode) {
				console.warn(`Link source or target node not found: ${link.source}, ${link.target}`);
			}
			return sourceNode && targetNode;
		});
	
		if (nodesData.length === 0 || this.validatedLinks.length === 0) {
			this.updatingVisualization = false;
			console.warn('No nodes or links to display after filtering. Aborting update.');
			 // Clear the existing nodes and links from the visualization
			 this.nodeSelection = this.svgGroup.select('g.nodes').selectAll('circle').data([]).exit().remove();
			 this.linkSelection = this.svgGroup.select('g.links').selectAll('line').data([]).exit().remove();
			 this.linkLabelSelection = this.svgGroup.select('g.link-labels').selectAll('text').data([]).exit().remove();
			 this.labelSelection = this.svgGroup.select('g.node-labels').selectAll('text').data([]).exit().remove();
			return;
		}
	
		this.updateNodeAndLinkSelection(nodesData);

		// Final check before starting the simulation
		nodesData.forEach((node: any) => {

			if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) {
				console.error(`Node with invalid position before starting simulation: ${node.id}`);
				node.x = Math.random() * 1000; // or some default value
				node.y = Math.random() * 1000; // or some default value
			}
		});
		
		if (!this.simulation || this.currentNoteChanging || this.isFiltering) {
			const { width, height } = this.getSVGDimensions();
			this.initializeSimulation(width, height);
			this.currentNoteChanging = false;
			this.isFiltering = false;
		}
	
		this.simulation.nodes(nodesData).on('tick', this.simulationTickHandler.bind(this));
		this.simulation.force('link').links(this.validatedLinks)
		.distance((d: any) => this.linkDistanceScale(d.score)); // Ensure the link distance is applied

		this.simulation.alpha(1).restart();
	
		this.updatingVisualization = false;
	}

	simulationTickHandler() {
		this.nodeSelection.attr('cx', (d: any) => {
			return d.x;
		}).attr('cy', (d: any) => d.y).style('cursor', 'pointer');
		this.linkSelection.attr('x1', (d: any) => d.source.x || 0).attr('y1', (d: any) => d.source.y || 0).style('cursor', 'pointer')
			.attr('x2', (d: any) => d.target.x || 0).attr('y2', (d: any) => d.target.y || 0);
		this.linkLabelSelection.attr('x', (d: any) => ((d.source.x + d.target.x) / 2))
			.attr('y', (d: any) => ((d.source.y + d.target.y) / 2));
		this.labelSelection
			.attr('x', (d: any) => d.x)
			.attr('y', (d: any) => d.y);
	
	}
	
	
	
	updateConnections() {
		this.nodes = [];
		this.links = [];
		this.connections = [];
		this.minScore = 1;
		this.maxScore = 0;
		if (!this.currentNoteKey) return;
		this.centralNote = this.smartNotes[this.currentNoteKey];
		const noteConnections = this.centralNote.find_connections().filter(
			(connection: any) => connection.score >= this.relevanceScoreThreshold);
		this.addCentralNode();
		this.addFilteredConnections(noteConnections);
		const isValid = this.validateGraphData(this.nodes, this.links);
		if (!isValid) console.error('Graph data validation failed.');
	}
	
	
	addCentralNode() {
		
		if (this.centralNote.key && this.centralNote.key.trim() !== '' && !this.nodes.some((node: { id: any; }) => node.id === this.centralNote.key)) {

			const svg = this.svg.node() as SVGSVGElement;
			const { width, height } = svg.getBoundingClientRect();

			this.nodes.push({
				id: this.centralNote.key,
				name: this.centralNote.key,
				group: 'note',
				x: width / 2,
				y: height / 2,
				fx: null,
				fy: null,
				selected: false,
				highlighted: false
			});
			this.centralNode = this.nodes[this.nodes.length - 1];
		} else {
			console.error(`Central node not found or already exists: ${this.centralNote.key}`);
		}
	}
	
	addFilteredConnections(noteConnections: any) {
		const filteredConnections = noteConnections.filter((connection: any) => connection.__proto__.constructor.name === (this.connectionType === 'block' ? 'SmartBlock' : 'SmartNote'));
		// console.log('Filtered connections:', filteredConnections);
		filteredConnections.forEach((connection: any, index: any) => {
			// console.log('Filtered connection:', connection, 'Index:', index);
			if (connection && connection.data && connection.data.key) {
				const connectionId = connection.data.key;
				// console.log('Adding connection node for ID:', connectionId);

				this.addConnectionNode(connectionId);
				// console.log('Adding connection link for ID:', connectionId);

				this.addConnectionLink(connectionId, connection);
			} else {
				// console.warn(`Skipping invalid connection at index ${index}:`, connection);
			}
		});
		// console.log('Nodes after addFilteredConnections:', this.nodes);
		// console.log('Links after addFilteredConnections:', this.links);	
	}

	addConnectionNode(connectionId: string) {
		if (!this.nodes.some((node: { id: string; }) => node.id === connectionId)) {
			this.nodes.push({
				id: connectionId,
				name: connectionId,
				group: this.connectionType,
				x: Math.random() * 1000,
				y: Math.random() * 1000,
				fx: null,
				fy: null,
				selected: false,
				highlighted: false
			});
		} else {
			console.log('Node already exists for connection ID:', connectionId);
		}
	}
	
	addConnectionLink(connectionId: string, connection: any) {
		const sourceNode = this.nodes.find((node: { id: string; }) => node.id === this.centralNote.key);
		const targetNode = this.nodes.find((node: { id: string; }) => node.id === connectionId);
	
		if (!sourceNode) {
			console.error(`Source node not found: ${this.centralNote.key}`);
			return;
		}
	
		if (!targetNode) {
			console.error(`Target node not found: ${connectionId}`);
			return;
		}
	
		this.links.push({
			source: this.centralNote.key,
			target: connectionId,
			value: connection.score || 0
		});
		this.connections.push({
			source: this.centralNote.key,
			target: connectionId,
			score: connection.score || 0
		});
		this.updateScoreRange(connection.score);
	}
	

	updateScoreRange(score: number) {
		if (score > this.maxScore) this.maxScore = score;
		if (score < this.minScore) this.minScore = score;
	}

	validateGraphData(nodes: any[], links: any[]): boolean {
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
	

	updateNodeAndLinkSelection(nodesData: any) {
		const svgGroup = this.svgGroup;
	
		 // Update links first
		 this.linkSelection = svgGroup.select('g.links').selectAll('line')
		 .data(this.validatedLinks, (d: any) => `${d.source}-${d.target}`)
		 .join(
			 enter => this.enterLink(enter),
			 update => this.updateLink(update),
			 exit => exit.remove()
		 );
 
		
		 this.linkLabelSelection = svgGroup.select('g.link-labels').selectAll('text')
        .data(this.validatedLinks, (d: any) => `${d.source.id}-${d.target.id}`)
        .join(
            enter => this.enterLinkLabel(enter),
            update => this.updateLinkLabel(update),
            exit => exit.remove()
        );
	
		this.labelSelection = svgGroup.select('g.node-labels').selectAll('text')
			.data(nodesData, (d: any) => d.id)
			.join(
				enter => this.enterLabel(enter),
				update => this.updateLabel(update),
				exit => exit.remove()
			)
			.attr('x', (d: any) => d.x)
			.attr('y', (d: any) => d.y);

		// Update nodes after links
		this.nodeSelection = svgGroup.select('g.nodes').selectAll('circle')
			.data(nodesData, (d: any) => { 
				 return d.id;
				})
			.join(
				enter => this.enterNode(enter),
				update => this.updateNode(update),
				exit => exit.remove()
			);
	
	}
	

	enterNode(enter: any) {
		const that = this;  // Reference to 'this' context for inner functions
		return enter.append('circle')
			.attr('class', 'node')
			.attr('r', (d: any) => d.id === this.centralNode.id ? this.nodeSize + 2 : this.nodeSize)
			.attr('fill', (d: any) => this.getNodeFill(d))
			.attr('stroke', (d: any) => d.selected ? 'blanchedalmond' : 'transparent')
			.attr('stroke-width', (d: any) => d.selected ? 1.5 : 0.3)
			.attr('opacity', 1)
			.attr('cursor', 'pointer')
			.call(d3.drag().on('start', this.onDragStart.bind(this))
				.on('drag', this.onDrag.bind(this))
				.on('end', this.onDragEnd.bind(this)))
			.on('click', this.onNodeClick.bind(this))
			.on('mouseover', this.onNodeMouseOver.bind(this))
			.on('mouseout', this.onNodeMouseOut.bind(this));
	}

	updateNode(update: any) {
		return update.attr('r', (d: any) => d.id === this.centralNode.id ? this.nodeSize + 2 : this.nodeSize)
			.attr('fill', (d: any) => d.selected ? '#f3ee5d' : this.getNodeFill(d))
			.attr('stroke', (d: any) => d.selected ? 'blanchedalmond' : 'transparent')
			.attr('stroke-width', (d: any) => d.selected ? 1.5 : 0.3);
	}
	onDragStart(event: any, d: any) {
		if (!event.active) this.simulation.alphaTarget(0.3).restart();
		this.dragging = true;
		d.fx = d.x;
		d.fy = d.y;
	}
	
	onDrag(event: any, d: any) {

		// Ensure hovering date isnt active when dragging.
		if(this.isHovering) this.isHovering = false;

		d.fx = event.x;
		d.fy = event.y;
	
		// if (d.id === this.centralNode.id) {
		//  // Update the position of the node's label immediately during dragging
		//  this.labelSelection
		//  .filter((node: any) => node.id === d.id)
		//  .attr('x', d.x)
		//  .attr('y', () => {
		// 	 if (d.highlighted) {
		// 		 return d.y + 8; // Keep label 8px down if node is highlighted
		// 	 }
		// 	 return d.y;
		//  });

		// }

	}
	
	
	
	onDragEnd(event: any, d: any) {
		if (!event.active) this.simulation.alphaTarget(0);
		d.fx = null;
		d.fy = null;
		this.dragging = false


	}
	
	onNodeClick(event: any, d: any) {

		// Don't need to touch central since we're in it
		if(d.id === this.centralNode.id) return;

		this.env.plugin.open_note(d.id, event)

		// event.stopPropagation();
		// TODO:: Bring back when ready for selection

		// if (!this.isAltPressed) this.clearSelections();
		// d.selected = !d.selected;
		// if (!d.selected) {
		// 	d.highlighted = false;
		// }
		// this.updateNodeAppearance();
	}	

	onNodeMouseOver(event: any, d: any) {

		// Dont trigger possible highlights if user dragging around nodes quickly for fun
		if(this.dragging) return;
					
		// Don't apply hover affect to center node
		if(d.id === this.centralNode.id) return;

		// Hovering state active
		this.isHovering = true;

		// Highlight node
		this.highlightNode(d);

		// Show link labels associated with the node
		this.updateLinkLabelAppearance(d);

		// TODO:: Comment back when ready to implement Label Movement animation on hover
		// console.log(`Hovering over node: ${d.id}, original y: ${d.y}`);
		// this.svgGroup.select(`text[data-id='${d.id}']`).transition().duration(4000).attr('y', d.y + 8); // Animate label down 10 pixels
	
		this.app.workspace.trigger("hover-link", {
			event,
			source: 'D3',
			hoverParent: event.currentTarget.parentElement,
			targetEl: event.currentTarget,
			linktext: d.id,
		});
	}
	
	onNodeMouseOut(event: any, d: any) {
		if (this.dragging) return;

		this.isHovering = false;
		this.centerHighlighted = false;
		this.unhighlightNode(d);

		// Hide link labels associated with the node
		this.updateLinkLabelAppearance({ id: null });
	
		// TODO:: Comment back when ready to implement Label MOvement animation on hover
		// console.log(`Mouse out from node: ${d.id}, returning label to y: ${d.y}`);
		// this.svgGroup.select(`text[data-id='${d.id}']`).transition().duration(400).attr('y', d.y); // Animate label back to original position
	}
	
	updateLinkLabelPositions() {
		this.linkLabelSelection
			.attr('x', (d: any) => (d.source.x + d.target.x) / 2)
			.attr('y', (d: any) => (d.source.y + d.target.y) / 2);
	}
	updateLinkSelection(svgGroup: any) {
		return svgGroup.select('g.links').selectAll('line')
			.data(this.validatedLinks, (d: any) => `${d.source}-${d.target}`)
			.style('cursor', 'pointer')
			.join(
				(enter: any) => this.enterLink(enter),
				(update: any) => this.updateLink(update),
				(exit: { remove: () => any; }) => exit.remove()
			);
	}

	enterLink(enter: any) {
		return enter.append('line')
			.attr('class', 'link')
			.attr('stroke', '#4c7787')
			.attr('stroke-width', (d: any) => this.getLinkStrokeWidth(d))
			.attr('stroke-opacity', 1)
			.attr('opacity', 1);
	}

	updateLink(update: any) {
		return update.attr('stroke', '#4c7787')
			.attr('stroke-width', (d: any) => this.getLinkStrokeWidth(d));
	}

	getLinkStrokeWidth(d: any) {
		return d3.scaleLinear()
			.domain([this.minScore, this.maxScore])
			.range([this.minLinkThickness, this.maxLinkThickness])(d.score);
	}

	updateLinkLabelSelection(svgGroup: any) {
		return svgGroup.append('g')
			.attr('class', 'link-labels')
			.selectAll('text')
			.data(this.validatedLinks, (d: any) => `${d.source.id}-${d.target.id}`)
			.join(
				(enter: any) => this.enterLinkLabel(enter),
				(update: any) => this.updateLinkLabel(update),
				(exit: { remove: () => any; }) => exit.remove()
			);
	}

	enterLinkLabel(enter: any) {
		return enter.append('text')
			.attr('class', 'link-label')
			.attr('font-size', this.linkLabelSize)
			.attr('fill', '#bbb')
			.attr('opacity', 0)
			.attr('x', (d: any) => d.x) // Initialize x position
			.attr('y', (d: any) => d.y) // Initialize y position

			.text((d: any) => (d.score * 100).toFixed(1) + '%');
	}

	updateLinkLabel(update: any) {
		
		return update.text((d: any) => (d.score * 100).toFixed(1))
		.attr('x', (d: any) => d.x) // Initialize x position
		.attr('y', (d: any) => d.y) // Initialize y position

	}

	enterLabel(enter: any) {
		return enter.append('text')
			.attr('class', 'label')
			.attr('dx', 0)
			.attr('font-size', this.nodeLabelSize)
			.attr('dy', 12)
			.attr('text-anchor', 'middle')
			.attr('fill', '#bbb')
			.attr('data-id', (d: any) => d.id)
			.attr('opacity', 1)
			.attr('x', (d: any) => d.x) // Initialize x position
			.attr('y', (d: any) => d.y) // Initialize y position
			.text((d: any) => this.formatLabel(d.name));
	}
	
	
	updateLabel(update: any) {
		return update.attr('dx', 0)
			.attr('data-id', (d: any) => d.id)
			.attr('text-anchor', 'middle')
			.text((d: any) => d.id === this.highlightedNodeId ? this.formatLabel(d.name, false) : this.formatLabel(d.name, true))
			.attr('fill', '#bbb')
			.attr('font-size', this.nodeLabelSize)
			.attr('x', (d: any) => d.x) // Update x position
			.attr('y', (d: any) => d.y) // Update y position with offset for highlight
			.attr('opacity', 1);
	}
	
  
	updateSimulation(nodesData: any) {
		if (!nodesData || !this.validatedLinks) {
			console.error('Nodes data or validated links are undefined');
			return;
		}
	
		const simulation = d3.forceSimulation(nodesData)
			.force('link', d3.forceLink(this.validatedLinks)
				.id((d: any) => d.id)
				.distance((d: any) => this.linkDistanceScale(d.score))
				.strength(this.linkForce))			
			.force('charge', d3.forceManyBody().strength(-this.repelForce))
			.force('collide', d3.forceCollide().radius(this.nodeSize + 3).strength(0.7))
			.on('tick', this.simulationTickHandler.bind(this));
	
		this.simulation = simulation;
		this.simulation.alpha(0.3).alphaTarget(0.05).restart();
	}
	

	updateNodeSizes() {
		this.nodeSelection.attr('r', (d: any) => d.id === this.centralNode.id ? this.nodeSize + 3 : this.nodeSize);
	}

	updateLinkThickness() {
		const linkStrokeScale = d3.scaleLinear()
			.domain([this.minScore, this.maxScore])
			.range([this.minLinkThickness, this.maxLinkThickness]);
		this.linkSelection.attr('stroke-width', (d: any) => linkStrokeScale(d.score));
	}

	updateSimulationForces() {
		if (!this.simulation) {
			console.error('Simulation not initialized');
			return;
		}
		this.simulation
			// .force('center', d3.forceCenter(width / 2, height / 2).strength(this.centerForce))
			.force('charge', d3.forceManyBody().strength(-this.repelForce))
			.force('link', d3.forceLink(this.validatedLinks)
				.id((d: any) => d.id)
				.distance((d: any) => this.linkDistanceScale(d.score))
				.strength(this.linkForce))		
			// .force('collide', d3.forceCollide().radius(this.nodeSize + 3).strength(0.7));

    		this.simulation.alphaTarget(0.3).restart();
	}

	normalizeScore(score: number) : number{
        return (score - this.minScore) / (this.maxScore - this.minScore);
    }

	linkDistanceScale(score: number) {
        return d3.scaleLinear()
            .domain([0, 1])
            .range([this.linkDistance * 2, this.linkDistance / 2])(this.normalizeScore(score));
    }
	

	updateLabelOpacity(zoomLevel: number) {
		const maxOpacity = 1;
		const minOpacity = 0;
		const minZoom = 0.1;
		const maxZoom = this.textFadeThreshold; // Use the threshold value from the slider
	
		let newOpacity = (zoomLevel - minZoom) / (maxZoom - minZoom);
		if (zoomLevel <= minZoom) newOpacity = minOpacity;
		if (zoomLevel >= maxZoom) newOpacity = maxOpacity;
	
		newOpacity = Math.max(minOpacity, Math.min(maxOpacity, newOpacity));
		
		// Update node labels opacity based on zoom level
		this.labelSelection.transition().duration(300).attr('opacity', newOpacity);
	}	
	

	updateNodeLabels() {
		this.labelSelection.attr('font-size', this.nodeLabelSize)
			.text((d: any) => this.formatLabel(d.name, true));
	}

	updateLinkLabelSizes() {

		if (this.linkLabelSelection) {
			this.linkLabelSelection.attr('font-size', this.linkLabelSize);
		}
	}

	updateNodeLabelSizes() {
		this.labelSelection.attr('font-size', this.nodeLabelSize);
	}

	updateNodeLabelOpacity(zoomLevel: number) {
		const maxOpacity = 1;
		const minOpacity = 0;
		const minZoom = 0.1;
		const maxZoom = this.textFadeThreshold; // Use the threshold value from the slider
	
		let newOpacity = (zoomLevel - minZoom) / (maxZoom - minZoom);
		if (zoomLevel <= minZoom) newOpacity = minOpacity;
		if (zoomLevel >= maxZoom) newOpacity = maxOpacity;
	
		newOpacity = Math.max(minOpacity, Math.min(maxOpacity, newOpacity));
		
		this.labelSelection.transition().duration(300).attr('opacity', newOpacity);
	}

	startBoxSelection(event: any) {
		if (!this.isCtrlPressed) return;
		this.isDragging = true;
		const [x, y] = d3.pointer(event);
		this.selectionBox = d3.select('svg').append('rect')
			.attr('class', 'selection-box')
			.attr('x', x)
			.attr('y', y)
			.attr('width', 0)
			.attr('height', 0)
			.attr('stroke', '#00f')
			.attr('stroke-width', 1)
			.attr('fill', 'rgba(0, 0, 255, 0.3)');
		this.startX = x;
		this.startY = y;
	}

	updateBoxSelection(event: any) {
		if (!this.isDragging) return;
		const [x, y] = d3.pointer(event);
		const newWidth = x - this.startX;
		const newHeight = y - this.startY;
		this.selectionBox
			.attr('width', Math.abs(newWidth))
			.attr('height', Math.abs(newHeight))
			.attr('x', Math.min(x, this.startX))
			.attr('y', Math.min(y, this.startY));
		this.updateNodeSelectionInBox(newWidth, newHeight);
		this.updateNodeAppearance();
	}

	updateNodeSelectionInBox(newWidth: number, newHeight: number) {
		const endX = this.startX + newWidth;
		const endY = this.startY + newHeight;
		const transformedStartX = Math.min(this.startX, endX);
		const transformedStartY = Math.min(this.startY, endY);
		const transformedEndX = Math.max(this.startX, endX);
		const transformedEndY = Math.max(this.startY, endY);
		const transform = d3.zoomTransform(d3.select('svg').node() as Element);
		const zoomedStartX = (transformedStartX - transform.x) / transform.k;
		const zoomedStartY = (transformedStartY - transform.y) / transform.k;
		const zoomedEndX = (transformedEndX - transform.x) / transform.k;
		const zoomedEndY = (transformedEndY - transform.y) / transform.k;
		this.nodeSelection.each((d: any) => {
			const nodeX = d.x;
			const nodeY = d.y;
			d.selected = nodeX >= zoomedStartX && nodeX <= zoomedEndX && nodeY >= zoomedStartY && nodeY <= zoomedEndY;
		});
	}

	endBoxSelection() {
		if (!this.isDragging) return;
		this.isDragging = false;
		this.selectionBox.remove();
	}

	

	// TODO:: Add back in when ready for toolti
	// showTooltip(event: any, d: any) {
	// 	const tooltip = d3.select('.tooltip');
	// 	tooltip.text(d.name)
	// 		.style('visibility', 'visible');
	// 	const [x, y] = d3.pointer(event);
	// 	tooltip.style('top', `${y + 10}px`)
	// 		.style('left', `${x + 10}px`);
	// }

	// hideTooltip() {
	// 	const tooltip = d3.select('.tooltip');
	// 	tooltip.style('visibility', 'hidden');
	// }

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

    async onload() {

		// Register the new view
        this.registerView("smart-connections-visualizer", (leaf: WorkspaceLeaf) => new ScGraphItemView(leaf));

				// Register hover link source
				this.registerHoverLinkSource('smart-connections-visualizer', {
					display: 'Smart connections visualizer hover link source',
					defaultMod: true
				});

        // This creates an icon in the left ribbon.
        this.addRibbonIcon('git-fork', 'Open smart connections visualizer', (evt: MouseEvent) => {
            // Create a new leaf in the current workspace
            let leaf = this.app.workspace.getLeaf(true);
    
            // Set the new leaf's view to your custom view
            leaf.setViewState({
                type: "smart-connections-visualizer",
                active: true,
            });
        })

    }

    onunload() {}

}
