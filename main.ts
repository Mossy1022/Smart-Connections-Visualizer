import { Plugin, ItemView, WorkspaceLeaf } from 'obsidian';
import * as d3 from "d3";

interface ScGraphViewSettings {
    mySetting: string;
}

const DEFAULT_SETTINGS: ScGraphViewSettings = {
    mySetting: 'default'
}


const DEFAULT_NETWORK_SETTINGS : any = {
	scoreThreshold: 0.6,
	nodeSize: 3,
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
	relevanceScoreThreshold = 0.6;
	nodeSize = 3;
	linkThickness = 0.3;
	repelForce = 400;
	linkForce = 0.4;
	linkDistance = 70;
	centerForce = 0.1;
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
	

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
		this.currentNoteKey = '';
		this.isHovering = false;
    }

    getViewType(): string {
        return "Smart Connections Visualizer";
    }

    getDisplayText(): string {
        return "Smart Connections Visualizer";
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
        this.nodeSelection.each((d: any) => {
            if (d.id !== this.centralNode.id) {
                d.highlighted = (d.id === node.id || this.validatedLinks.some((link: any) =>
                    (link.source.id === node.id && link.target.id === d.id) ||
                    (link.target.id === node.id && link.source.id === d.id)));
            }
        });
        this.updateNodeAppearance();
        this.updateLinkAppearance(node);
        this.updateLabelAppearance(node, true); // Pass true to indicate label movement
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

	updateLabelAppearance(node: any, moveDown: boolean) {
		this.labelSelection.transition().duration(500)
			.attr('opacity', (d: any) => this.getLabelOpacity(d, node))
			.attr('y', (d: any) => {
				if (node && d.id === node.id && moveDown) {
					return d.y + 8; // Move label 8px down if node is highlighted
				}
				return d.y; // Reset to original position
			})
			.text((d: any) => node && d.id === node.id ? this.formatLabel(d.name, false) : this.formatLabel(d.name, true));
	}
	
	getLabelOpacity(d: any, node: any) {
		if (!node) {
			return 1; // Reset to full opacity if no node is highlighted
		}
		return (d.id === node.id || this.validatedLinks.some((link: any) =>
			(link.source.id === node.id && link.target.id === d.id))) ? 1 : 0.1;
	}
	
	updateLinkLabelAppearance(node: any) {
		this.linkLabelSelection.transition().duration(500)
			.attr('opacity', (d: any) => (d.source.id === node.id || d.target.id === node.id) ? 1 : 0);
	}
	

	unhighlightNode() {
        this.nodeSelection.each((d: any) => {
            if (d.id !== this.centralNode.id) d.highlighted = false;
        });
        this.updateNodeAppearance();
        this.resetLinkAppearance();
        this.resetLabelAppearance();
        this.resetLinkLabelAppearance();
        this.updateLabelAppearance(null, false); // Pass false to reset label position
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
		const parts = path.split('#');
		let label = parts[parts.length - 1];
		return label.replace(/[\[\]]/g, '');
	}

	truncateLabel(label: string) {
		return label.length > this.maxLabelCharacters ? label.slice(0, this.maxLabelCharacters) + '...' : label;
	}

	get smartEnv() { return window.SmartSearch?.main?.env; }
	get smartNotes() { return window.SmartSearch?.main?.env?.smart_notes?.items; }
	

	async onOpen() {
		this.contentEl.createEl('h2', { text: 'Smart Visualizer' });
		this.contentEl.createEl('p', { text: 'Waiting for Smart Connections to load...' });
		this.render();
	}

	async render() {
		// wait until this.smartNotes is available
		while (!this.smartEnv?.entities_loaded) {
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
			if (this.smartEnv?.entities_loaded) {
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
			.force('center', d3.forceCenter(width / 2, height / 2).strength(this.centerForce).strength(0.1))
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
	}

	setupNodesAndLinks(svgGroup: any) {
		this.nodeSelection = this.createNodes(svgGroup);
		this.linkSelection = this.createLinks(svgGroup);
	}

	avoidLabelCollisions() {
		const padding = 5; // Adjust padding as needed
		return (alpha: number) => {
			for (let i = 0; i < this.labelSelection.size(); ++i) {
				const label = this.labelSelection.nodes()[i];
				const node = d3.select(label).datum();
				for (let j = 0; j < this.labelSelection.size(); ++j) {
					if (i === j) continue;
					const otherLabel = this.labelSelection.nodes()[j];
					const otherNode = d3.select(otherLabel).datum();
	
					const dx = (node as any).x - (otherNode as any).x;
					const dy = (node as any).y - (otherNode as any).y;
					const distance = Math.sqrt(dx * dx + dy * dy);
					const minDistance = padding + this.nodeLabelSize;
	
					if (distance < minDistance) {
						const angle = Math.atan2(dy, dx);
						const moveX = (minDistance - distance) * Math.cos(angle);
						const moveY = (minDistance - distance) * Math.sin(angle);
	
						(node as any).x += moveX * alpha;
						(node as any).y += moveY * alpha;
						(otherNode as any).x -= moveX * alpha;
						(otherNode as any).y -= moveY * alpha;
					}
				}
			}
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

	onMouseDown(event: any) {
		if (!event.ctrlKey) this.clearSelections();
		this.startBoxSelection(event);
	}

	onMouseMove(event: any) {
		this.updateBoxSelection(event);
	}

	onMouseUp() {
		this.endBoxSelection();
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

	createSettingsIcon() {
		const settingsIcon = this.contentEl.createEl('div', { cls: 'settings-icon' });
		settingsIcon.createEl('span', { text: '⚙' }); // Unicode character for settings icon
		settingsIcon.addEventListener('click', this.toggleDropdownMenu);
	}

	createDropdownMenu() {
		const dropdownMenu = this.contentEl.createEl('div', { cls: 'dropdown-menu' });
		this.buildDropdownMenuContent(dropdownMenu);
	}

	buildDropdownMenuContent(dropdownMenu: HTMLElement) {
		const menuHeader = dropdownMenu.createEl('div', { cls: 'menu-header' });
		menuHeader.createEl('div', { cls: 'icon', attr: { id: 'refresh-icon' }, text: '⟳' });
		menuHeader.createEl('div', { cls: 'icon', attr: { id: 'close-icon' }, text: '✖' });
	
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
			text: `Min Relevance: ${(this.relevanceScoreThreshold * 100).toFixed(0)}%`, 
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
	
		parent.createEl('label', { text: 'Connection Type:', cls: 'settings-item-content-label' });
	
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
			{ id: 'nodeSize', label: 'Node Size', value: this.nodeSize, min: 1, max: 15, step: 0.01 },
			{ id: 'maxLabelCharacters', label: 'Max Label Characters', value: this.maxLabelCharacters, min: 1, max: 50, step: 1 },
			{ id: 'linkLabelSize', label: 'Link Label Size', value: this.linkLabelSize, min: 1, max: 15, step: 0.01 },
			{ id: 'nodeLabelSize', label: 'Node Label Size', value: this.nodeLabelSize, min: 1, max: 26, step: 1 },
			{ id: 'minLinkThickness', label: 'Min Link Thickness', value: this.minLinkThickness, min: 0.1, max: 10, step: 0.01 },
			{ id: 'maxLinkThickness', label: 'Max Link Thickness', value: this.maxLinkThickness, min: 0.1, max: 10, step: 0.01 },
			{ id: 'fadeThreshold', label: 'Text Fade Threshold', value: this.textFadeThreshold, min: 0.1, max: 10, step: 0.01 }
		];
	
		displaySettings.forEach(setting => {
			const sliderContainer = parent.createEl('div', { cls: 'slider-container' });
			sliderContainer.createEl('label', { text: `${setting.label}: ${setting.value}`, attr: { id: `${setting.id}Label`, for: setting.id } });
			sliderContainer.createEl('input', { attr: { type: 'range', id: setting.id, class: 'slider', name: setting.id, min: `${setting.min}`, max: `${setting.max}`, value: `${setting.value}`, step: `${setting.step}` } });
		});
	}
	

	getForcesContent(parent: HTMLElement) {
		const forcesSettings = [
			{ id: 'repelForce', label: 'Repel Force', value: this.repelForce, min: 0, max: 1500, step: 1 },
			{ id: 'linkForce', label: 'Link Force', value: this.linkForce, min: 0, max: 1, step: 0.01 },
			{ id: 'linkDistance', label: 'Link Distance', value: this.linkDistance, min: 10, max: 200, step: 1 }
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
			const debouncedUpdate = this.debounce((event: Event) => this.updateVisualization(parseFloat((event.target as HTMLInputElement).value)), 500);
			scoreThresholdSlider.addEventListener('input', debouncedUpdate);
		}
	}

	updateScoreThreshold(event: any) {
		const newScoreThreshold = parseFloat(event.target.value);
		const label = document.getElementById('scoreThresholdLabel');
		if (label) label.textContent = `Min Relevance: ${(newScoreThreshold * 100).toFixed(0)}%`;
	}

	debounce(func: Function, wait: number) {
		let timeout: number | undefined;
		return function (...args: any[]) {
			clearTimeout(timeout);
			timeout = window.setTimeout(() => func.apply(this, args), wait);
		};
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
		this.updateSliders();
		this.updateNodeSizes();
		this.updateLinkThickness();
		this.updateSimulationForces();
		this.updateVisualization(this.relevanceScoreThreshold);
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
				this.render();
			}
		});
	}

	updateVisualization(newScoreThreshold?: number) {
		if (this.updatingVisualization && !this.isChangingConnectionType) {
			this.updatingVisualization = false;
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
		const nodesData = Array.from(visibleNodes).map((id: any) => {
			const node = this.nodes.find((node: any) => node.id === id);
			return node ? node : null;
		}).filter(Boolean);
	
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
			return;
		}
	
		this.updateNodeAndLinkSelection(nodesData);
		
		if (!this.simulation) {
			const { width, height } = this.getSVGDimensions();
			this.initializeSimulation(width, height);
		}
	
		this.simulation.nodes(nodesData).on('tick', this.simulationTickHandler.bind(this));
		this.simulation.force('link').links(this.validatedLinks)
		.distance((d: any) => this.linkDistanceScale(d.score)); // Ensure the link distance is applied

		this.simulation.alpha(1).restart();
	
		this.updatingVisualization = false;
	}

	simulationTickHandler() {
		this.nodeSelection.attr('cx', (d: any) => d.x || 0).attr('cy', (d: any) => d.y || 0);
		this.linkSelection.attr('x1', (d: any) => d.source.x || 0).attr('y1', (d: any) => d.source.y || 0)
			.attr('x2', (d: any) => d.target.x || 0).attr('y2', (d: any) => d.target.y || 0);
		this.linkLabelSelection.attr('x', (d: any) => ((d.source.x + d.target.x) / 2) || 0)
			.attr('y', (d: any) => ((d.source.y + d.target.y) / 2) || 0);
		this.labelSelection
			.attr('x', (d: any) => d.x || 0)
			.attr('y', (d: any) => {
				if (d.highlighted) {
					return d.y + 8; // Keep label 8px down if node is highlighted
				}
				return d.y;
			});
	
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
		filteredConnections.forEach((connection: any, index: any) => {
			if (connection && connection.data && connection.data.key && connection.data.key.trim() !== '') {
				const connectionId = connection.data.key;
				this.addConnectionNode(connectionId);
				this.addConnectionLink(connectionId, connection);
			} else {
				console.warn(`Skipping invalid connection at index ${index}:`, connection);
			}
		});
	}

	addConnectionNode(connectionId: string) {
		if (!this.nodes.some((node: { id: string; }) => node.id === connectionId)) {
			this.nodes.push({
				id: connectionId,
				name: connectionId,
				group: 'block',
				x: Math.random() * 1000,
				y: Math.random() * 1000,
				fx: null,
				fy: null,
				selected: false,
				highlighted: false
			});
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
			.data(nodesData, (d: any) => d.id)
			.join(
				enter => this.enterNode(enter),
				update => this.updateNode(update),
				exit => exit.remove()
			);
	
	}
	

	updateNodeSelection(svgGroup: any, nodesData: any) {
		return svgGroup.select('g.nodes').selectAll('circle')
			.data(nodesData, (d: any) => d.id)
			.join(
				(enter: any) => this.enterNode(enter),
				(update: any) => this.updateNode(update),
				(exit: { remove: () => any; }) => exit.remove()
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
		d.fx = event.x;
		d.fy = event.y;
	
		 // Update the position of the node's label immediately during dragging
		 this.labelSelection
		 .filter((node: any) => node.id === d.id)
		 .attr('x', d.x)
		 .attr('y', () => {
			 if (d.highlighted) {
				 return d.y + 8; // Keep label 8px down if node is highlighted
			 }
			 return d.y;
		 });
 
	 // Update the node position immediately during dragging
	 this.nodeSelection
		 .filter((node: any) => node.id === d.id)
		 .attr('cx', d.x)
		 .attr('cy', d.y);
	}
	
	
	
	onDragEnd(event: any, d: any) {
		if (!event.active) this.simulation.alphaTarget(0);
		d.fx = null;
		d.fy = null;
		this.dragging = false
	}
	
	onNodeClick(event: any, d: any) {
		event.stopPropagation();
		if (!this.isAltPressed) this.clearSelections();
		// TODO:: Bring back when ready for selection
		// d.selected = !d.selected;
		// if (!d.selected) {
		// 	d.highlighted = false;
		// }
		this.updateNodeAppearance();
	}	

	onNodeMouseOver(event: any, d: any) {		
		this.isHovering = true;
		if (!d.selected) this.highlightNode(d);
		// Show link labels associated with the node
		this.updateLinkLabelAppearance(d);
	
		// TODO:: Comment back when ready to implement Label MOvement animation on hover
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
		if (!d.selected) this.unhighlightNode();
		// Hide link labels associated with the node
		this.updateLinkLabelAppearance({ id: null });
	
		// TODO:: Comment back when ready to implement Label MOvement animation on hover
		// console.log(`Mouse out from node: ${d.id}, returning label to y: ${d.y}`);
		// this.svgGroup.select(`text[data-id='${d.id}']`).transition().duration(400).attr('y', d.y); // Animate label back to original position
	}

	updateLinkSelection(svgGroup: any) {
		return svgGroup.select('g.links').selectAll('line')
			.data(this.validatedLinks, (d: any) => `${d.source}-${d.target}`)
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
			.text((d: any) => (d.score * 100).toFixed(1) + '%');
	}

	updateLinkLabel(update: any) {
		return update.text((d: any) => (d.score * 100).toFixed(1));
	}

	updateLabelSelection(svgGroup: any, nodesData: any) {
		return svgGroup.select('g.labels').selectAll('text')
			.data(nodesData, (d: any) => d.id)
			.join(
				(enter: any) => this.enterLabel(enter),
				(update: any) => this.updateLabel(update),
				(exit: { remove: () => any; }) => exit.remove()
			)
			.attr('x', (d: any) => d.x)
			.attr('y', (d: any) => d.y);
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
			.text((d: any) => this.formatLabel(d.name))
			.attr('fill', '#bbb')
			.attr('font-size', this.nodeLabelSize)
			.attr('x', (d: any) => d.x) // Update x position
			.attr('y', (d: any) => d.highlighted ? d.y + 8 : d.y) // Update y position with offset for highlight
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
				.strength(this.linkForce))			// .force('center', d3.forceCenter(this.contentEl.clientWidth / 2, this.contentEl.clientHeight / 2).strength(0.1)) // Adjust the strength as needed
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
			.force('collide', d3.forceCollide().radius(this.nodeSize + 3).strength(0.7));

    		this.simulation.alpha(1).restart();
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

	showTooltip(event: any, d: any) {
		const tooltip = d3.select('.tooltip');
		tooltip.text(d.name)
			.style('visibility', 'visible');
		const [x, y] = d3.pointer(event);
		tooltip.style('top', `${y + 10}px`)
			.style('left', `${x + 10}px`);
	}

	hideTooltip() {
		const tooltip = d3.select('.tooltip');
		tooltip.style('visibility', 'hidden');
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
        this.registerView("Smart Connections Visualizer", (leaf: WorkspaceLeaf) => new ScGraphItemView(leaf));

				// Register hover link source
				this.registerHoverLinkSource('Smart Connections Visualizer', {
					display: 'Smart Connections Visualizer Hover Link Source',
					defaultMod: true
				});

        // This creates an icon in the left ribbon.
        const ribbonIconEl = this.addRibbonIcon('git-fork', 'Smart Connections Visualizer', (evt: MouseEvent) => {
            // Called when the user clicks the icon.
            // Create a new leaf in the current workspace
            let leaf = this.app.workspace.getLeaf(true);
    
            // Set the new leaf's view to your custom view
            leaf.setViewState({
                type: "Smart Connections Visualizer",
                active: true,
            });
        })

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
                    type: "Smart Connections Visualizer",
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
                    type: "Smart Connections Visualizer",
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