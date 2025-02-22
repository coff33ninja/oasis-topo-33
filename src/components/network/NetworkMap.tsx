
import { useEffect, useState, useRef, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { api } from '@/services/api';
import type { Device } from '@/types/api';
import { useToast } from '@/hooks/use-toast';
import { MapComponent } from './MapComponent';
import { ForceGraphComponent } from './ForceGraphComponent';
import { iconDictionary } from './IconMapping';
import { LoadingState } from './LoadingState';
import { ErrorState } from './ErrorState';

interface NetworkMapProps {
    networkDevices?: Device[];
    onDeviceSelect?: (device: Device | null) => void;
    selectedDevice?: Device | null;
}

interface GraphNode {
    id: string;
    name: string;
    type: string;
    status: string;
    val: number;
    icon: JSX.Element | null;
    x?: number;
    y?: number;
    fx?: number | null;
    fy?: number | null;
    location?: { lat: number; lng: number };
}

interface GraphLink {
    source: string;
    target: string;
    type: string;
    animated: boolean;
}

interface GraphData {
    nodes: GraphNode[];
    links: GraphLink[];
}

export const NetworkMap = ({ networkDevices, onDeviceSelect, selectedDevice }: NetworkMapProps) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();
    const [devices, setDevices] = useState<Device[]>([]);
    const [loading, setLoading] = useState(true);
    const [isMapLoaded, setIsMapLoaded] = useState(false);
    const [mapsApiKey, setMapsApiKey] = useState("");
    const [mapError, setMapError] = useState<string | null>(null);
    const [mapDimensions, setMapDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setMapDimensions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight
                });
            }
        };

        updateDimensions();
        window.addEventListener('resize', updateDimensions);
        return () => window.removeEventListener('resize', updateDimensions);
    }, []);

    useEffect(() => {
        const savedApiKey = localStorage.getItem('VITE_GOOGLE_MAPS_API_KEY');
        if (savedApiKey) {
            setMapsApiKey(savedApiKey);
        } else {
            setMapError('Google Maps API key not found. Please configure it in settings.');
        }
    }, []);

    const fetchDevices = async () => {
        try {
            if (networkDevices) {
                setDevices(networkDevices);
            } else {
                const data = await api.getAllDevices();
                setDevices(data);
            }
        } catch (error) {
            toast({
                title: "Error",
                description: "Failed to fetch network data",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (networkDevices) {
            setDevices(networkDevices);
            setLoading(false);
        } else {
            fetchDevices();
            const interval = setInterval(fetchDevices, 30000);
            return () => clearInterval(interval);
        }
    }, [networkDevices]);

    const getDeviceIcon = (type: string) => {
        const IconComponent = iconDictionary[type.toLowerCase()];
        return IconComponent ? <IconComponent /> : null;
    };

    const graphData = useMemo<GraphData>(() => {
        const nodes: GraphNode[] = devices.map(device => ({
            id: device.id,
            name: device.name,
            type: device.type,
            status: device.status,
            val: 1,
            icon: getDeviceIcon(device.type),
            location: {
                lat: Math.random() * 180 - 90,
                lng: Math.random() * 360 - 180
            }
        }));

        // Create a more complex web of connections
        const links: GraphLink[] = [];
        
        // Connect all devices to the gateway (first device)
        const gateway = devices[0];
        devices.slice(1).forEach(device => {
            links.push({
                source: gateway.id,
                target: device.id,
                type: "straight",
                animated: device.status === "online",
            });
        });

        // Connect switches to each other
        const switches = devices.filter(d => d.type === 'switch');
        switches.forEach((sw, idx) => {
            if (idx < switches.length - 1) {
                links.push({
                    source: sw.id,
                    target: switches[idx + 1].id,
                    type: "straight",
                    animated: sw.status === "online" && switches[idx + 1].status === "online",
                });
            }
        });

        // Connect servers to nearest switch
        const servers = devices.filter(d => d.type === 'server');
        servers.forEach((server, idx) => {
            const targetSwitch = switches[idx % switches.length];
            if (targetSwitch) {
                links.push({
                    source: server.id,
                    target: targetSwitch.id,
                    type: "straight",
                    animated: server.status === "online" && targetSwitch.status === "online",
                });
            }
        });

        return { nodes, links };
    }, [devices]);

    const getNodeColor = (node: GraphNode) => {
        if (node.status === 'offline') return '#ef4444';
        switch (node.type.toLowerCase()) {
            case 'router':
                return '#3b82f6';
            case 'switch':
                return '#10b981';
            case 'server':
                return '#8b5cf6';
            case 'access-point':
                return '#3b82f6';
            default:
                return '#6b7280';
        }
    };

    const handleMapError = (error: Error) => {
        setMapError(error.message);
        toast({
            title: "Error",
            description: "Failed to load Google Maps",
            variant: "destructive",
        });
    };

    const handleMapLoad = () => {
        setIsMapLoaded(true);
    };

    return (
        <div ref={containerRef} className="h-full w-full relative">
            {loading ? (
                <LoadingState />
            ) : (
                <>
                    {mapError ? (
                        <ErrorState message={mapError} />
                    ) : mapsApiKey ? (
                        <MapComponent
                            mapsApiKey={mapsApiKey}
                            mapDimensions={mapDimensions}
                            onError={handleMapError}
                            onLoad={handleMapLoad}
                        />
                    ) : null}
                    <div className="absolute inset-0">
                        <ForceGraphComponent
                            graphData={graphData}
                            containerRef={containerRef}
                            onNodeClick={(node: any) => {
                                const device = devices.find(d => d.id === node.id);
                                if (device && onDeviceSelect) {
                                    onDeviceSelect(device);
                                }
                            }}
                            getNodeColor={getNodeColor}
                        />
                    </div>
                </>
            )}
        </div>
    );
};
